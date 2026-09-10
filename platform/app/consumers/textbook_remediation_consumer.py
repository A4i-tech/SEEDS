"""Textbook remediation consumer.

Claims a pending job from textbookRemediationJobs and walks one uploaded PDF
through the three OmniIngest pipelines in app/remediation:

    ocr     book.pdf     -> raw.md
    review  raw.md       -> corrected.md + findings
    docx    corrected.md -> remediated.docx

Every artifact is uploaded the moment its stage finishes, so a failure in a
later stage still leaves the earlier ones readable rather than throwing away
the vision calls that produced them.

The pipelines run as a **subprocess**, not in this process, so a pipeline
crash cannot take the api/consumer process down with it.
`settings.remediation_python` names the interpreter to use — this project's
own by default, since omni-ingest is a local path dependency (pyproject.toml).

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
import json
import logging
import os
import subprocess
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from dotenv import dotenv_values
from pymongo.asynchronous.database import AsyncDatabase

from app.models.remediation_job import ARTIFACTS, RemediationJob
from app.platform.settings import get_settings
from app.remediation.detect_language import detect_language
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 10
JOB_TIMEOUT_SECONDS = 4 * 60 * 60
PIPELINE_DIR = Path(__file__).resolve().parent.parent / "remediation"
PLATFORM_ROOT = PIPELINE_DIR.parent.parent


async def _run_pipeline(
    pipeline: str,
    resource: Path,
    workspace: Path,
    options: list[str],
    on_progress: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
) -> None:
    """Runs one pipeline YAML to completion, raising with its stderr on failure."""
    default_output = [] if "--output" in options else ["--output", str(workspace / f"{Path(pipeline).stem}.run.json")]
    progress_file = workspace / f"{Path(pipeline).stem}.progress.jsonl"
    command = [
        get_settings().remediation_python, "-m", "app.remediation.run",
        str(PIPELINE_DIR / pipeline), "--input", str(resource),
        *default_output, "--quiet", "--progress-file", str(progress_file), *options,
    ]
    env = {
        **os.environ,
        **{k: v for k, v in dotenv_values(PLATFORM_ROOT / ".env").items() if v is not None},
        "PYTHONPATH": str(PLATFORM_ROOT),
        "PYTHONIOENCODING": "utf-8",
    }

    def _exec() -> tuple[int, str]:
        proc = subprocess.Popen(
            command, cwd=str(workspace), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        stdout, stderr = proc.communicate()
        err_msg = stderr.decode("utf-8", "replace").strip() or stdout.decode("utf-8", "replace").strip()
        return proc.returncode, err_msg

    stop_tailing = asyncio.Event()

    async def _tail_progress() -> None:
        file_pos = 0
        while not stop_tailing.is_set():
            if progress_file.exists():
                try:
                    with open(progress_file, encoding="utf-8") as f:
                        f.seek(file_pos)
                        lines = f.readlines()
                        file_pos = f.tell()
                    for line in lines:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            evt = json.loads(line)
                            if on_progress:
                                await on_progress(evt)
                        except Exception:
                            pass
                except Exception:
                    pass
            await asyncio.sleep(0.5)

    tail_task = asyncio.create_task(_tail_progress())
    try:
        returncode, err_msg = await asyncio.to_thread(_exec)
    finally:
        stop_tailing.set()
        await asyncio.sleep(0.1)
        tail_task.cancel()

    if returncode != 0:
        raise RuntimeError(f"{pipeline} failed: {err_msg[-2000:]}")


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


async def _upload_images(blob_provider: Any, job_id: str, search_dir: Path) -> int:
    """Uploads any extracted image files (crops from OCR) to blob storage."""
    container = get_settings().azure_storage_container
    count = 0
    for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp", "*.gif", "*.svg"):
        for img_path in search_dir.rglob(ext):
            if not img_path.is_file():
                continue
            filename = img_path.name
            suffix = img_path.suffix.lower()
            content_type = "image/jpeg" if suffix in (".jpg", ".jpeg") else f"image/{suffix.lstrip('.')}"
            try:
                await blob_provider.upload_file(
                    container, f"textbook-remediation/{job_id}/images/{filename}", img_path.read_bytes(), content_type
                )
                count += 1
            except Exception as exc:
                logger.warning("remediation: failed to upload image %s: %s", filename, exc)
    logger.info("remediation: uploaded %d extracted figure images for job_id=%s", count, job_id)
    return count


async def _process_job(job: RemediationJob, repo: TextbookRemediationRepository, blob_provider: Any) -> None:
    def make_progress_handler(stage_name: str) -> Callable[[dict[str, Any]], Awaitable[None]]:
        async def _handler(evt: dict[str, Any]) -> None:
            data: dict[str, Any] = {
                "stage": stage_name,
                "step": evt.get("step_name"),
                "type": evt.get("type"),
                "message": evt.get("message"),
            }
            if "completed" in evt and "total" in evt:
                data["completed"] = evt["completed"]
                data["total"] = evt["total"]
                if evt.get("total"):
                    data["percent"] = int((evt["completed"] / evt["total"]) * 100)
            await repo.update_progress(job.job_id, data)
        return _handler

    with tempfile.TemporaryDirectory() as workspace:
        work = Path(workspace)
        out = work / "out"
        out.mkdir(parents=True, exist_ok=True)
        pdf = work / "book.pdf"
        pdf.write_bytes(await blob_provider.download_from_url(job.source_url))

        # Upfront language probe from PDF text or name
        probed_lang = "English"
        try:
            import pypdf
            reader = pypdf.PdfReader(str(pdf))
            sample_text = "".join((page.extract_text() or "") for page in reader.pages[:5])
            if sample_text.strip():
                probed_lang = detect_language(sample_text)
            elif "hindi" in job.source_name.lower() or "ganit" in job.source_name.lower():
                probed_lang = "Hindi"
            elif "kannada" in job.source_name.lower():
                probed_lang = "Kannada"
            elif "tamil" in job.source_name.lower():
                probed_lang = "Tamil"
        except Exception as exc:
            logger.warning("remediation: upfront probe failed: %s", exc)

        target_lang = (job.language if job.language and job.language not in ("auto", "detecting") else None) or probed_lang
        await repo.update_language(job.job_id, target_lang)

        logger.info("remediation: ocr job_id=%s source=%s language=%s", job.job_id, job.source_name, target_lang)
        await repo.update_progress(job.job_id, {"stage": "ocr", "message": f"Starting OCR in {target_lang}..."})
        await _run_pipeline(
            "textbook_ocr.yaml", pdf, work,
            ["--output", str(out / "raw.md"), "--language", target_lang],
            on_progress=make_progress_handler("ocr"),
        )
        raw = out / "raw.md"
        detected_lang = target_lang
        if raw.exists():
            detected_lang = detect_language(raw.read_text(encoding="utf-8", errors="ignore"))
            await repo.update_language(job.job_id, detected_lang)
            logger.info("remediation: confirmed detected language=%s for job_id=%s", detected_lang, job.job_id)

        await _upload_images(blob_provider, job.job_id, work)
        await repo.record_artifacts(
            job.job_id, await _upload(blob_provider, job.job_id, out, "raw"),
            {"raw_chars": raw.stat().st_size if raw.exists() else 0},
        )

        effective_language = (job.language if job.language and job.language not in ("auto", "detecting") else None) or detected_lang or "English"
        script = "devanagari" if effective_language.lower() in ("hindi", "marathi", "sanskrit") else "latin"

        logger.info("remediation: review job_id=%s language=%s script=%s", job.job_id, effective_language, script)
        await repo.set_stage(job.job_id, "review")
        await repo.update_progress(job.job_id, {"stage": "review", "message": f"Reviewing in {effective_language}..."})
        await _run_pipeline(
            "review.yaml", raw, work,
            ["--out-dir", str(out), "--script", script],
            on_progress=make_progress_handler("review"),
        )
        corrected, findings = out / "raw.corrected.md", out / "raw.findings.jsonl"
        await repo.record_artifacts(
            job.job_id, await _upload(blob_provider, job.job_id, out, "corrected", "findings"),
            {"findings": _count_lines(findings)},
        )

        logger.info("remediation: docx job_id=%s", job.job_id)
        await repo.set_stage(job.job_id, "docx")
        await repo.update_progress(job.job_id, {"stage": "docx", "message": "Starting Remediate DOCX stage..."})
        docx = out / "remediated.docx"
        await _run_pipeline(
            "textbook_docx.yaml", corrected, work,
            ["--out-dir", str(out), "--out", str(docx)],
            on_progress=make_progress_handler("docx"),
        )
        trail, unresolved = out / "raw.corrected.remediation.jsonl", out / "remediated.unresolved.jsonl"
        await repo.record_artifacts(
            job.job_id, await _upload(blob_provider, job.job_id, out, "docx", "remediated", "remediation", "unresolved"),
            {"remediation_changes": _count_lines(trail), "unresolved_images": _count_lines(unresolved),
             "docx_bytes": docx.stat().st_size if docx.exists() else 0},
        )

        # Compute user-facing domain metrics for review & dashboard
        import re
        total_pages = 1
        diagrams_count = 0
        if raw.exists():
            raw_content = raw.read_text(encoding="utf-8", errors="ignore")
            pages = re.findall(r"<!--\s*page\s+(\d+)\s*-->", raw_content)
            total_pages = max([int(p) for p in pages] + [1])
            diagrams_count = len(re.findall(r"!\[.*?\]\(.*?\)", raw_content))

        metrics = {
            "total_pages": total_pages,
            "processed_pages": total_pages,
            "diagrams_described": diagrams_count,
            "tables_fixed": _count_lines(trail),
            "flagged_items_count": _count_lines(unresolved),
        }
        await repo.update_metrics(job.job_id, metrics)

    await repo.update_progress(job.job_id, {})
    await repo.finish(job.job_id, "ready_to_review")
    logger.info("remediation: ready_to_review job_id=%s", job.job_id)



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
                    error_msg = f"{type(exc).__name__}: {exc}" if not str(exc) else str(exc)
                    await self._repo.finish(job.job_id, "failed", error=error_msg)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.exception("TextbookRemediationConsumer: unexpected error in loop — %s", exc)
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
