"""Textbook remediation consumer.

Claims a pending job from textbookRemediationJobs and walks one uploaded PDF
through the three OmniIngest pipelines in app/remediation:

    ocr     book.pdf     -> raw.md
    review  raw.md       -> corrected.md + findings
    docx    corrected.md -> remediated.docx

Every artifact is uploaded the moment its stage finishes, so a failure in a
later stage still leaves the earlier ones readable rather than throwing away
the vision calls that produced them.

The pipelines run as a **subprocess**, not in this process. omni-ingest pulls
starlette >=1.0, which needs fastapi >=0.119, and the platform pins fastapi
<0.119 — the two cannot share an environment. `settings.remediation_python`
names the interpreter of the venv that has them; see
app/remediation/requirements.txt.

SECURITY:
  - subprocess is always called with the list form, never shell=True.
  - Every path passed to it is one this module built inside a temp directory.
  - `language` is user-supplied and is validated at the API boundary.

State machine:
    pending -> running -> completed
                       -> failed   (stage recorded, artifacts kept)

A restart while a job is running leaves it stranded; the startup sweep in
TextbookRemediationRepository.reconcile_interrupted_jobs marks it failed.
"""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.models.remediation_job import ARTIFACTS, RemediationJob
from app.platform.settings import get_settings
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 10
JOB_TIMEOUT_SECONDS = 4 * 60 * 60
PIPELINE_DIR = Path(__file__).resolve().parent.parent / "remediation"
PLATFORM_ROOT = PIPELINE_DIR.parent.parent

async def _run_pipeline(pipeline: str, resource: Path, workspace: Path, options: list[str]) -> None:
    """Runs one pipeline YAML to completion, raising with its stderr on failure."""
    command = [
        get_settings().remediation_python, "-m", "app.remediation.run",
        str(PIPELINE_DIR / pipeline), "--input", str(resource),
        "--output", str(workspace / f"{Path(pipeline).stem}.run.json"), "--quiet", *options,
    ]
    process = await asyncio.create_subprocess_exec(
        *command, cwd=str(workspace), env={**os.environ, "PYTHONPATH": str(PLATFORM_ROOT)},
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    if process.returncode != 0:
        raise RuntimeError(f"{pipeline} failed: {stderr.decode('utf-8', 'replace').strip()[-2000:]}")


def _count_lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines()) if path.exists() else 0


async def _upload(blob_provider: Any, job_id: str, out: Path, *names: str) -> dict[str, str]:
    """Uploads the named artifacts that exist. A step that was skipped writes nothing."""
    container = get_settings().azure_storage_container
    urls = {}
    for name in names:
        filename, content_type = ARTIFACTS[name]
        path = out / filename
        if not path.exists():
            continue
        urls[name] = await blob_provider.upload_file(
            container, f"textbook-remediation/{job_id}/{filename}", path.read_bytes(), content_type
        )
    return urls


async def _process_job(job: RemediationJob, repo: TextbookRemediationRepository, blob_provider: Any) -> None:
    with tempfile.TemporaryDirectory() as workspace:
        work = Path(workspace)
        out = work / "out"
        pdf = work / "book.pdf"
        pdf.write_bytes(await blob_provider.download_from_url(job.source_url))

        logger.info("remediation: ocr job_id=%s source=%s", job.job_id, job.source_name)
        await _run_pipeline("textbook_ocr.yaml", pdf, work, ["--out", str(out / "raw.md"), "--language", job.language])
        raw = out / "raw.md"
        await repo.record_artifacts(
            job.job_id, await _upload(blob_provider, job.job_id, out, "raw"),
            {"raw_chars": raw.stat().st_size if raw.exists() else 0},
        )

        logger.info("remediation: review job_id=%s", job.job_id)
        await repo.set_stage(job.job_id, "review")
        await _run_pipeline("review.yaml", raw, work, ["--language", job.language, "--out-dir", str(out)])
        corrected, findings, alt = out / "raw.corrected.md", out / "raw.findings.jsonl", out / "raw.alt.jsonl"
        await repo.record_artifacts(
            job.job_id, await _upload(blob_provider, job.job_id, out, "corrected", "findings", "alt"),
            {"findings": _count_lines(findings), "alt_translated": _count_lines(alt)},
        )

        logger.info("remediation: docx job_id=%s", job.job_id)
        await repo.set_stage(job.job_id, "docx")
        docx = out / "remediated.docx"
        await _run_pipeline("textbook_docx.yaml", corrected, work,
                            ["--out-dir", str(out), "--out", str(docx)])
        trail, unresolved = out / "raw.corrected.remediation.jsonl", out / "remediated.unresolved.jsonl"
        await repo.record_artifacts(
            job.job_id, await _upload(blob_provider, job.job_id, out, "docx", "remediated", "remediation", "unresolved"),
            {"remediation_changes": _count_lines(trail), "unresolved_images": _count_lines(unresolved),
             "docx_bytes": docx.stat().st_size if docx.exists() else 0},
        )

    await repo.finish(job.job_id, "completed")
    logger.info("remediation: completed job_id=%s", job.job_id)


class TextbookRemediationConsumer:
    """Polls textbookRemediationJobs for pending jobs and runs the pipelines."""

    def __init__(self, db: AsyncDatabase) -> None:
        self._repo = TextbookRemediationRepository(db)
        self._running = False

    async def run(self) -> None:
        self._running = True
        logger.info("TextbookRemediationConsumer: started")
        try:
            await self._run_loop()
        except asyncio.CancelledError:
            logger.info("TextbookRemediationConsumer: cancelled")
        finally:
            self._running = False

    async def stop(self) -> None:
        self._running = False

    async def _run_loop(self) -> None:
        blob_provider = None
        while self._running:
            if blob_provider is None:
                try:
                    from app.providers.blob_storage import BlobStorageProvider  # noqa: PLC0415

                    blob_provider = BlobStorageProvider()
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "TextbookRemediationConsumer: BlobStorageProvider unavailable — %s. Retrying in %ds.",
                        exc, POLL_INTERVAL_SECONDS,
                    )
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
                    continue

            try:
                job = await self._repo.claim_next_pending()
                if job is None:
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
                    continue
                try:
                    await asyncio.wait_for(_process_job(job, self._repo, blob_provider), timeout=JOB_TIMEOUT_SECONDS)
                except TimeoutError:
                    logger.error("remediation: timeout job_id=%s", job.job_id)
                    await self._repo.finish(job.job_id, "failed", error=f"exceeded timeout of {JOB_TIMEOUT_SECONDS}s")
                except Exception as exc:  # noqa: BLE001
                    logger.exception("remediation: failed job_id=%s", job.job_id)
                    await self._repo.finish(job.job_id, "failed", error=str(exc))
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.exception("TextbookRemediationConsumer: unexpected error in loop — %s", exc)
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
