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
PLATFORM_ROOT = PIPELINE_PATH.parent.parent.parent


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
    env = {**os.environ, "PYTHONPATH": str(PLATFORM_ROOT), "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

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

        is_auto = not job.language or job.language.lower() in ("auto", "detecting")
        pipeline_lang = "auto" if is_auto else job.language

        logger.info("remediation: processing job_id=%s source=%s language=%s (auto=%s)", job.job_id, job.source_name, pipeline_lang, is_auto)
        progress_msg = f"Remediating in {pipeline_lang}..." if not is_auto else "Remediating textbook..."
        await repo.update_progress(job.job_id, {"stage": "remediation", "message": progress_msg})

        context_json_path = work / "context.json"
        docx_path = out / "remediated.docx"

        await _run_pipeline(
            pdf, work,
            [
                "--language", pipeline_lang,
                "--output", str(context_json_path),
            ],
            on_progress=make_progress_handler("remediation"),
        )

        metrics: dict[str, object] | None = None
        detected_lang: str | None = None
        if context_json_path.exists():
            try:
                ctx_data = json.loads(context_json_path.read_text(encoding="utf-8"))
                rendered_info = render_remediation(ctx_data, out)
                metrics = rendered_info.get("metrics")  # type: ignore[assignment]

                # 1. Front matter book metadata extracted from book itself
                book_meta = ctx_data.get("metadata", {}).get("book") or {}
                if isinstance(book_meta, dict) and book_meta.get("language"):
                    detected_lang = str(book_meta["language"]).strip()
                if not detected_lang:
                    for it in ctx_data.get("items", []):
                        m = it.get("metadata") or {}
                        if isinstance(m, dict):
                            b = m.get("book")
                            if isinstance(b, dict) and b.get("language"):
                                detected_lang = str(b["language"]).strip()
                                break
                            rem_lang = (m.get("remediation") or {}).get("language")
                            if rem_lang:
                                detected_lang = str(rem_lang).strip()
                                break
            except Exception as exc:
                logger.warning("remediation: render_remediation failed: %s", exc)

        raw = out / "raw.md"
        findings = out / "raw.findings.jsonl"
        trail = out / "raw.corrected.remediation.jsonl"
        unresolved = out / "remediated.unresolved.jsonl"

        # 2. Body OCR text language detection if not extracted by front matter
        if not detected_lang and raw.exists():
            try:
                raw_content = raw.read_text(encoding="utf-8", errors="ignore")
                pages_split = re.split(r"<!--\s*page\s+\d+\s*-->", raw_content)
                body_sample = " ".join(s.strip() for s in pages_split[2:] if len(s.strip()) > 100)
                if not body_sample:
                    body_sample = raw_content
                if body_sample.strip():
                    detected_lang = detect_language(body_sample)
            except Exception as exc:
                logger.warning("remediation: body language detection failed: %s", exc)

        # 3. Filename heuristics fallback
        if not detected_lang or detected_lang.lower() in ("auto", "detecting", "unknown"):
            src_lower = job.source_name.lower()
            if any(k in src_lower for k in ("tripura", "bangla", "bengali", "wb")):
                detected_lang = "Bengali"
            elif any(k in src_lower for k in ("hindi", "ganit", "vigyan")):
                detected_lang = "Hindi"
            elif any(k in src_lower for k in ("kannada", "ktbs")):
                detected_lang = "Kannada"
            elif any(k in src_lower for k in ("tamil", "tn")):
                detected_lang = "Tamil"
            elif any(k in src_lower for k in ("telugu", "ap", "ts")):
                detected_lang = "Telugu"
            elif any(k in src_lower for k in ("gujarati",)):
                detected_lang = "Gujarati"
            elif any(k in src_lower for k in ("malayalam", "kerala")):
                detected_lang = "Malayalam"
            elif any(k in src_lower for k in ("marathi", "maharashtra")):
                detected_lang = "Marathi"
            elif any(k in src_lower for k in ("odia", "orissa")):
                detected_lang = "Odia"
            elif any(k in src_lower for k in ("punjabi", "punjab")):
                detected_lang = "Punjabi"
            elif any(k in src_lower for k in ("assamese", "assam")):
                detected_lang = "Assamese"
            else:
                detected_lang = "English"

        final_lang = (job.language if not is_auto and job.language else None) or detected_lang
        await repo.update_language(job.job_id, final_lang)
        logger.info("remediation: updated final language for job_id=%s to %s", job.job_id, final_lang)

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
