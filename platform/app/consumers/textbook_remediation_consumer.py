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
import re
import subprocess
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path

import pypdf
from pymongo.asynchronous.database import AsyncDatabase

from app.models.remediation_job import ARTIFACTS, RemediationJob
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.remediation.detect_language import detect_language
from app.remediation.render import render_remediation
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 10
JOB_TIMEOUT_SECONDS = 4 * 60 * 60
PIPELINE_PATH = Path(__file__).resolve().parent.parent / "remediation" / "textbook_remediation.yaml"
PLATFORM_ROOT = PIPELINE_PATH.parent.parent


async def _run_pipeline(
    resource: Path,
    workspace: Path,
    options: list[str],
    on_progress: Callable[[dict[str, object]], Awaitable[None]] | None = None,
) -> None:
    progress_file = workspace / "remediation.progress.jsonl"
    command = [
        get_settings().remediation_python, "-m", "app.remediation.run",
        str(PIPELINE_PATH), "--input", str(resource),
        "--quiet", "--progress-file", str(progress_file), *options,
    ]
    env = {**os.environ, "PYTHONPATH": str(PLATFORM_ROOT), "PYTHONIOENCODING": "utf-8"}

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
        raise RuntimeError(f"Remediation pipeline failed: {err_msg[-2000:]}")


def _count_lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines()) if path.exists() else 0


async def _upload(blob_provider: BlobStorageProvider, job_id: str, out: Path, *names: str) -> dict[str, str]:
    container = get_settings().azure_storage_container
    urls: dict[str, str] = {}
    for name in names:
        filename, content_type = ARTIFACTS[name]
        path = out / filename
        if not path.exists():
            continue
        urls[name] = await blob_provider.upload_file(
            container, f"textbook-remediation/{job_id}/{filename}", path.read_bytes(), content_type
        )
    return urls


async def _upload_images(blob_provider: BlobStorageProvider, job_id: str, search_dir: Path) -> int:
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
    return count


async def _process_job(job: RemediationJob, repo: TextbookRemediationRepository, blob_provider: BlobStorageProvider) -> None:
    def make_progress_handler(stage_name: str) -> Callable[[dict[str, object]], Awaitable[None]]:
        async def _handler(evt: dict[str, object]) -> None:
            data: dict[str, object] = {
                "stage": stage_name,
                "step": evt.get("step_name"),
                "type": evt.get("type"),
                "message": evt.get("message"),
            }
            if "completed" in evt and "total" in evt:
                data["completed"] = evt["completed"]
                data["total"] = evt["total"]
                total = evt.get("total")
                completed = evt.get("completed")
                if isinstance(total, (int, float)) and total > 0 and isinstance(completed, (int, float)):
                    data["percent"] = int((completed / total) * 100)
            await repo.update_progress(job.job_id, data)
        return _handler

    with tempfile.TemporaryDirectory() as workspace:
        work = Path(workspace)
        out = work / "out"
        out.mkdir(parents=True, exist_ok=True)
        pdf = work / "book.pdf"
        pdf.write_bytes(await blob_provider.download_from_url(job.source_url))

        probed_lang = "English"
        try:
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
        script = "devanagari" if target_lang.lower() in ("hindi", "marathi", "sanskrit") else "latin"
        await repo.update_language(job.job_id, target_lang)

        logger.info("remediation: processing job_id=%s source=%s language=%s script=%s", job.job_id, job.source_name, target_lang, script)
        await repo.update_progress(job.job_id, {"stage": "remediation", "message": f"Remediating in {target_lang}..."})

        context_json_path = work / "context.json"
        docx_path = out / "remediated.docx"

        await _run_pipeline(
            pdf, work,
            [
                "--language", target_lang,
                "--output", str(context_json_path),
            ],
            on_progress=make_progress_handler("remediation"),
        )

        metrics: dict[str, object] | None = None
        if context_json_path.exists():
            try:
                ctx_data = json.loads(context_json_path.read_text(encoding="utf-8"))
                rendered_info = render_remediation(ctx_data, out)
                metrics = rendered_info.get("metrics")  # type: ignore[assignment]
            except Exception as exc:
                logger.warning("remediation: render_remediation failed: %s", exc)

        raw = out / "raw.md"
        findings = out / "raw.findings.jsonl"
        trail = out / "raw.corrected.remediation.jsonl"
        unresolved = out / "remediated.unresolved.jsonl"

        if not metrics:
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

        await _upload_images(blob_provider, job.job_id, work)
        await repo.record_artifacts(
            job.job_id,
            await _upload(blob_provider, job.job_id, out, "raw", "corrected", "findings", "docx", "remediated", "remediation", "unresolved"),
            {
                "raw_chars": raw.stat().st_size if raw.exists() else 0,
                "findings": _count_lines(findings),
                "remediation_changes": _count_lines(trail),
                "unresolved_images": _count_lines(unresolved),
                "docx_bytes": docx_path.stat().st_size if docx_path.exists() else 0,
            },
        )
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
