from __future__ import annotations

import asyncio
import json
import logging
import re
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path

from pymongo.asynchronous.database import AsyncDatabase

from app.consumers.base_consumer import BaseConsumer, PermanentError
from app.models.remediation_job import (
    ARTIFACTS,
    IMAGE_CONTENT_TYPES,
    ArtifactName,
    JobMetrics,
    JobProgress,
    JobStage,
    JobStatus,
    RemediationJob,
    artifact_filename,
)
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider, get_blob_storage_provider
from app.remediation.detect_language import (
    detect_language,
    normalize_language_name,
)
from app.remediation.render import render_remediation
from app.remediation.run_pipeline import run_pipeline
from app.remediation.translate import run_translation
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 10
JOB_TIMEOUT_SECONDS = 4 * 60 * 60
PIPELINE_PATH = Path(__file__).resolve().parent.parent / "remediation" / "textbook_remediation.yaml"


def _count_lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines()) if path.exists() else 0


async def _upload(
    blob_provider: BlobStorageProvider, job_id: str, out: Path, *names: ArtifactName
) -> dict[ArtifactName, str]:
    container = get_settings().azure_storage_container
    urls: dict[ArtifactName, str] = {}
    for name in names:
        filename, content_type = ARTIFACTS[name]
        path = out / filename
        if not path.exists() or path.stat().st_size == 0:
            continue
        urls[name] = await blob_provider.upload_file(
            container, f"textbook-remediation/{job_id}/{filename}", path.read_bytes(), content_type
        )
    return urls


async def _upload_images(blob_provider: BlobStorageProvider, job_id: str, search_dir: Path) -> int:
    container = get_settings().azure_storage_container
    count = 0
    for extension, content_type in IMAGE_CONTENT_TYPES.items():
        for img_path in search_dir.rglob(f"*{extension}"):
            if not img_path.is_file():
                continue
            try:
                await blob_provider.upload_file(
                    container,
                    f"textbook-remediation/{job_id}/images/{img_path.name}",
                    img_path.read_bytes(),
                    content_type,
                )
                count += 1
            except Exception as exc:
                logger.warning("remediation: failed to upload image %s: %s", img_path.name, exc)
    return count


def _metadata_language(ctx_data: dict[str, object]) -> str | None:
    book_meta = ctx_data.get("metadata", {}).get("book") or {}
    if isinstance(book_meta, dict) and book_meta.get("language"):
        return str(book_meta["language"]).strip()
    for item in ctx_data.get("items", []):
        if not isinstance(item, dict):
            continue
        meta = item.get("metadata") or {}
        if not isinstance(meta, dict):
            continue
        book = meta.get("book")
        if isinstance(book, dict) and book.get("language"):
            return str(book["language"]).strip()
        rem_lang = (meta.get("remediation") or {}).get("language")
        if rem_lang:
            return str(rem_lang).strip()
    return None


def _detect_body_language(raw_path: Path) -> str | None:
    content = raw_path.read_text(encoding="utf-8", errors="ignore")
    pages = re.split(r"<!--\s*page\s+\d+\s*-->", content)
    sample = " ".join(s.strip() for s in pages[2:] if len(s.strip()) > 100) or content
    return detect_language(sample) if sample.strip() else None


def _resolve_language(
    job: RemediationJob, is_auto: bool, ctx_data: dict[str, object] | None, raw_path: Path
) -> str:
    detected = _metadata_language(ctx_data) if ctx_data else None
    if not detected and raw_path.exists():
        try:
            detected = _detect_body_language(raw_path)
        except Exception as exc:
            logger.warning("remediation: body language detection failed: %s", exc)
    if not detected or detected.lower() in ("auto", "detecting", "unknown"):
        logger.warning("remediation: no detected language for job_id=%s", job.job_id)
        detected = "Unknown"
    requested = job.language if not is_auto and job.language else None
    return normalize_language_name(requested or detected)


def _fallback_metrics(raw_path: Path, trail: Path, unresolved: Path) -> JobMetrics:
    total_pages = 1
    diagrams_count = 0
    if raw_path.exists():
        content = raw_path.read_text(encoding="utf-8", errors="ignore")
        pages = re.findall(r"<!--\s*page\s+(\d+)\s*-->", content)
        total_pages = max([int(p) for p in pages] + [1])
        diagrams_count = len(re.findall(r"!\[.*?\]\(.*?\)", content))
    return JobMetrics(
        total_pages=total_pages,
        processed_pages=total_pages,
        diagrams_described=diagrams_count,
        tables_fixed=_count_lines(trail),
        flagged_items_count=_count_lines(unresolved),
    )


async def _translate_if_requested(
    job: RemediationJob,
    repo: TextbookRemediationRepository,
    blob_provider: BlobStorageProvider,
    out: Path,
) -> str | None:
    if not job.target_language:
        return None
    remediated_path = out / artifact_filename(ArtifactName.REMEDIATED)
    if not remediated_path.exists():
        message = "Remediation produced no text to translate."
        await repo.set_translation_error(job.job_id, message)
        return message
    try:
        translated_urls = await run_translation(
            job.job_id, remediated_path.read_bytes(), job.target_language, job.language, blob_provider
        )
        if not translated_urls:
            raise RuntimeError("Translation produced no downloadable file.")
        await repo.record_artifacts(
            job.job_id, {ArtifactName(name): url for name, url in translated_urls.items()}, {}
        )
        await repo.set_translation_error(job.job_id, None)
        return None
    except Exception as exc:
        logger.warning("remediation: translation failed for job_id=%s: %s", job.job_id, exc)
        message = str(exc)
        await repo.set_translation_error(job.job_id, message)
        return message


async def _process_job(
    job: RemediationJob, repo: TextbookRemediationRepository, blob_provider: BlobStorageProvider
) -> None:
    def make_progress_handler(stage_name: str) -> Callable[[dict[str, object]], Awaitable[None]]:
        async def _handler(evt: dict[str, object]) -> None:
            progress = JobProgress(
                stage=stage_name,
                step=evt.get("step_name"),
                type=evt.get("type"),
                message=evt.get("message"),
            )
            completed, total = evt.get("completed"), evt.get("total")
            if completed is not None and total is not None:
                progress.completed = float(completed) if isinstance(completed, (int, float)) else None
                progress.total = float(total) if isinstance(total, (int, float)) else None
            if progress.total:
                progress.percent = int((progress.completed or 0) / progress.total * 100)
            await repo.update_progress(job.job_id, progress)
        return _handler

    with tempfile.TemporaryDirectory() as workspace:
        work = Path(workspace)
        out = work / "out"
        out.mkdir(parents=True, exist_ok=True)
        pdf = work / "book.pdf"
        pdf.write_bytes(await blob_provider.download_from_url(job.source_url))

        is_auto = not job.language or job.language.lower() in ("auto", "detecting")
        pipeline_lang = "auto" if is_auto else job.language

        logger.info(
            "remediation: processing job_id=%s source=%s language=%s (auto=%s)",
            job.job_id, job.source_name, pipeline_lang, is_auto,
        )
        progress_msg = f"Remediating in {pipeline_lang}..." if not is_auto else "Remediating textbook..."
        await repo.update_progress(job.job_id, JobProgress(stage="remediation", message=progress_msg))

        context_json_path = work / "context.json"
        docx_path = out / artifact_filename(ArtifactName.DOCX)

        await run_pipeline(
            PIPELINE_PATH, pdf, work,
            ["--language", pipeline_lang, "--output", str(context_json_path)],
            on_progress=make_progress_handler("remediation"),
            timeout=JOB_TIMEOUT_SECONDS,
        )
        await repo.set_stage(job.job_id, JobStage.REVIEW)

        if not context_json_path.exists():
            raise RuntimeError(f"Pipeline {PIPELINE_PATH.name} produced no context output")
        ctx_data = json.loads(context_json_path.read_text(encoding="utf-8"))
        rendered_metrics = render_remediation(ctx_data, out).get("metrics")
        metrics = JobMetrics.model_validate(rendered_metrics) if isinstance(rendered_metrics, dict) else None

        raw = out / artifact_filename(ArtifactName.RAW)
        findings = out / artifact_filename(ArtifactName.FINDINGS)
        trail = out / artifact_filename(ArtifactName.REMEDIATION)
        unresolved = out / artifact_filename(ArtifactName.UNRESOLVED)

        final_lang = _resolve_language(job, is_auto, ctx_data, raw)
        await repo.update_language(job.job_id, final_lang)
        logger.info("remediation: updated final language for job_id=%s to %s", job.job_id, final_lang)

        if metrics is None:
            metrics = _fallback_metrics(raw, trail, unresolved)

        await _upload_images(blob_provider, job.job_id, work)
        await repo.record_artifacts(
            job.job_id,
            await _upload(
                blob_provider, job.job_id, out,
                ArtifactName.RAW, ArtifactName.CORRECTED, ArtifactName.FINDINGS, ArtifactName.ALT,
                ArtifactName.DOCX, ArtifactName.TEX, ArtifactName.PDF, ArtifactName.REMEDIATED,
                ArtifactName.REMEDIATION, ArtifactName.UNRESOLVED,
            ),
            {
                "raw_chars": raw.stat().st_size if raw.exists() else 0,
                "findings": _count_lines(findings),
                "remediation_changes": _count_lines(trail),
                "unresolved_images": _count_lines(unresolved),
                "docx_bytes": docx_path.stat().st_size if docx_path.exists() else 0,
            },
        )
        await repo.update_metrics(job.job_id, metrics)
        await repo.set_stage(job.job_id, JobStage.DOCX)

        translation_error = await _translate_if_requested(job, repo, blob_provider, out)

    await repo.update_progress(job.job_id, JobProgress())
    await repo.finish(job.job_id, JobStatus.READY_TO_REVIEW, error=translation_error)


class TextbookRemediationConsumer(BaseConsumer):
    name = "TextbookRemediationConsumer"

    def __init__(self, db: AsyncDatabase) -> None:
        self._repo = TextbookRemediationRepository(db)
        self._running = True
        self._blob_provider: BlobStorageProvider | None = None

    async def stop(self) -> None:
        self._running = False

    async def _run_loop(self) -> None:
        if not self._running:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            return

        if self._blob_provider is None:
            try:
                self._blob_provider = get_blob_storage_provider()
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "%s: BlobStorageProvider unavailable — %s. Retrying in %ds.",
                    self.name, exc, POLL_INTERVAL_SECONDS,
                )
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                return

        job = await self._repo.claim_next_pending()
        if job is None:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            return

        await self._safe_process(job)

    async def process(self, job: RemediationJob) -> None:
        if self._blob_provider is None:
            raise PermanentError("BlobStorageProvider unavailable")
        try:
            await asyncio.wait_for(
                _process_job(job, self._repo, self._blob_provider), timeout=JOB_TIMEOUT_SECONDS
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("remediation: failed job_id=%s", job.job_id)
            raise PermanentError(str(exc)) from exc

    async def _dead_letter(self, job: RemediationJob, reason: str) -> None:
        await self._repo.finish(job.job_id, JobStatus.FAILED, error=reason)
