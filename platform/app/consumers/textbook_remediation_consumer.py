from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path

import pymupdf
import yaml
from omni_ingest.core.config import settings as omni_settings
from pymongo.asynchronous.database import AsyncDatabase

from app.consumers.base_consumer import BaseConsumer, PermanentError
from app.models.remediation_job import (
    ARTIFACTS,
    AUTO_LANGUAGES,
    IMAGE_CONTENT_TYPES,
    ArtifactName,
    JobMetrics,
    JobModels,
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
from app.services.textbook_remediation import TextbookRemediationService

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 10
JOB_TIMEOUT_SECONDS = 4 * 60 * 60
PIPELINE_PATH = Path(__file__).resolve().parent.parent / "remediation" / "textbook_remediation.yaml"


def _count_lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines()) if path.exists() else 0


_CONFIG_REF = re.compile(r"^\$\{\.config\.(\w+)\}$")


def _resolve_model_ref(model: object, parameters: dict[str, object]) -> str:
    if model is None:
        return omni_settings.default_chat_completion_model
    match = _CONFIG_REF.match(str(model))
    if not match:
        return str(model)
    default = parameters.get("properties", {}).get(match.group(1), {}).get("default")
    return default or omni_settings.default_chat_completion_model


def _step_model(steps: list[dict[str, object]], path: str, parameters: dict[str, object]) -> str | None:
    for step in steps:
        if (step.get("config") or {}).get("path") == path:
            return _resolve_model_ref(step["config"].get("model"), parameters)
    return None


def _resolve_models(job: RemediationJob) -> JobModels:
    settings = get_settings()
    ocr = os.environ.get("MISTRAL_OCR_MODEL") or settings.mistral_ocr_model or None
    pipeline = yaml.safe_load(PIPELINE_PATH.read_text(encoding="utf-8"))
    parameters = pipeline.get("parameters", {})
    steps = pipeline.get("steps", [])
    verify = _step_model(steps, ".metadata.verified", parameters)
    alt_text = _step_model(steps, ".metadata.accessibility", parameters)
    block_tree = _step_model(steps, ".metadata.remediation", parameters)
    translation = omni_settings.default_translation_model if job.target_language else None
    return JobModels(ocr=ocr, verify=verify, block_tree=block_tree, alt_text=alt_text, translation=translation)


REQUIRED_ARTIFACTS: tuple[ArtifactName, ...] = (
    ArtifactName.RAW, ArtifactName.CORRECTED, ArtifactName.REMEDIATED, ArtifactName.DOCX,
)


async def _upload(
    blob_provider: BlobStorageProvider, job_id: str, out: Path, *names: ArtifactName
) -> dict[ArtifactName, str]:
    container = get_settings().azure_storage_container
    urls: dict[ArtifactName, str] = {}
    for name in names:
        filename, content_type = ARTIFACTS[name]
        path = out / filename
        if not path.exists() or path.stat().st_size == 0:
            if name in REQUIRED_ARTIFACTS:
                raise RuntimeError(f"Missing required artifact file: {filename}")
            continue
        with open(path, "rb") as fh:
            urls[name] = await blob_provider.upload_file(
                container, f"textbook-remediation/{job_id}/{filename}", fh, content_type
            )
    return urls


def _render_page_jpeg(doc: pymupdf.Document, page_index: int) -> bytes:
    pix = doc[page_index].get_pixmap(dpi=100)
    return pix.tobytes("jpeg")


async def _upload_source_pages(blob_provider: BlobStorageProvider, job_id: str, pdf: Path) -> int:
    container = get_settings().azure_storage_container
    doc = pymupdf.open(pdf)
    try:
        page_count = doc.page_count
        for page_index in range(page_count):
            try:
                data = await asyncio.to_thread(_render_page_jpeg, doc, page_index)
                await blob_provider.upload_file(
                    container, f"textbook-remediation/{job_id}/pages/{page_index + 1}.jpg", data, "image/jpeg"
                )
            except Exception as exc:
                raise RuntimeError(f"Failed to render source page {page_index + 1}: {exc}") from exc
        return page_count
    finally:
        doc.close()


async def _upload_images(blob_provider: BlobStorageProvider, job_id: str, search_dir: Path, out: Path) -> int:
    container = get_settings().azure_storage_container
    count = 0
    for extension, content_type in IMAGE_CONTENT_TYPES.items():
        for img_path in search_dir.rglob(f"*{extension}"):
            if not img_path.is_file():
                continue
            for attempt in range(1, 4):
                try:
                    with open(img_path, "rb") as fh:
                        await blob_provider.upload_file(
                            container,
                            f"textbook-remediation/{job_id}/images/{img_path.name}",
                            fh,
                            content_type,
                        )
                    count += 1
                    break
                except Exception as exc:
                    if attempt == 3:
                        logger.warning("remediation: failed to upload image %s after 3 attempts: %s", img_path.name, exc)
                        with open(out / artifact_filename(ArtifactName.UNRESOLVED), "a", encoding="utf-8") as f:
                            f.write(json.dumps({
                                "id": f"image_{img_path.name}",
                                "type": "image_upload_failed",
                                "text": img_path.name,
                                "reason": f"Image upload failed after 3 attempts: {exc}",
                            }) + "\n")
                    else:
                        await asyncio.sleep(min(2 ** (attempt - 1), 8))
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
    requested = job.language if not is_auto and job.language else None
    if requested:
        return normalize_language_name(requested)
    if not detected or detected.lower() in ("auto", "detecting", "unknown"):
        raise RuntimeError(
            f"Could not detect the language for job {job.job_id}. Select a language and retry."
        )
    return normalize_language_name(detected)


async def _translate_if_requested(
    job: RemediationJob,
    service: TextbookRemediationService,
    blob_provider: BlobStorageProvider,
    out: Path,
) -> str | None:
    if not job.target_language:
        return None
    remediated_path = out / artifact_filename(ArtifactName.REMEDIATED)
    try:
        translated_urls = await run_translation(
            job.job_id, remediated_path, job.target_language, job.language, blob_provider
        )
        if not translated_urls:
            raise RuntimeError("Translation produced no downloadable file.")
        await service.record_artifacts(
            job.job_id, {ArtifactName(name): url for name, url in translated_urls.items()}, {}
        )
        await service.set_translation_error(job.job_id, None)
        return None
    except Exception as exc:
        logger.warning("remediation: translation failed for job_id=%s: %s", job.job_id, exc)
        message = str(exc)
        await service.set_translation_error(job.job_id, message)
        return message


async def _process_job(
    job: RemediationJob, service: TextbookRemediationService, blob_provider: BlobStorageProvider
) -> None:
    def make_progress_handler(stage: JobStage) -> Callable[[dict[str, object]], Awaitable[None]]:
        async def _handler(evt: dict[str, object]) -> None:
            evt_type = evt.get("type")
            if evt_type in ("step_begin", "step_end"):
                logger.info("remediation: job_id=%s step=%s %s", job.job_id, evt.get("step_name"), evt_type)
            progress = JobProgress(
                stage=stage,
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
            await service.update_progress(job.job_id, progress)
        return _handler

    with tempfile.TemporaryDirectory() as workspace:
        work = Path(workspace)
        out = work / "out"
        out.mkdir(parents=True, exist_ok=True)
        pdf = work / "book.pdf"
        await blob_provider.download_from_url_to_file(job.source_url, pdf)
        page_count = await _upload_source_pages(blob_provider, job.job_id, pdf)
        await service.update_source_page_count(job.job_id, page_count)

        is_auto = not job.language or job.language.lower() in AUTO_LANGUAGES
        pipeline_lang = "auto" if is_auto else job.language

        logger.info(
            "remediation: processing job_id=%s source=%s language=%s (auto=%s)",
            job.job_id, job.source_name, pipeline_lang, is_auto,
        )
        progress_msg = f"Remediating in {pipeline_lang}..." if not is_auto else "Remediating textbook..."
        await service.update_progress(job.job_id, JobProgress(stage=JobStage.OCR, message=progress_msg))
        await service.update_models(job.job_id, _resolve_models(job))

        context_json_path = work / "context.json"
        docx_path = out / artifact_filename(ArtifactName.DOCX)

        await run_pipeline(
            PIPELINE_PATH, pdf, work,
            ["--language", pipeline_lang, "--output", str(context_json_path)],
            on_progress=make_progress_handler(JobStage.OCR),
            timeout=JOB_TIMEOUT_SECONDS,
        )
        await service.set_stage(job.job_id, JobStage.REVIEW)

        if not context_json_path.exists():
            raise RuntimeError(f"Pipeline {PIPELINE_PATH.name} produced no context output")

        def _load_and_render() -> tuple[dict[str, object], dict[str, object]]:
            ctx = json.loads(context_json_path.read_text(encoding="utf-8"))
            return ctx, render_remediation(ctx, out)

        ctx_data, render_result = await asyncio.to_thread(_load_and_render)
        rendered_metrics = render_result.get("metrics")
        if not isinstance(rendered_metrics, dict):
            raise RuntimeError(f"Render metrics are missing for job {job.job_id}.")
        metrics = JobMetrics.model_validate(rendered_metrics)

        raw = out / artifact_filename(ArtifactName.RAW)
        findings = out / artifact_filename(ArtifactName.FINDINGS)
        trail = out / artifact_filename(ArtifactName.REMEDIATION)
        unresolved = out / artifact_filename(ArtifactName.UNRESOLVED)

        final_lang = _resolve_language(job, is_auto, ctx_data, raw)
        await service.update_language(job.job_id, final_lang)
        logger.info("remediation: updated final language for job_id=%s to %s", job.job_id, final_lang)

        await _upload_images(blob_provider, job.job_id, out / "images", out)
        await service.record_artifacts(
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
        await service.update_metrics(job.job_id, metrics)
        await service.set_stage(job.job_id, JobStage.DOCX)

        translation_error = await _translate_if_requested(job, service, blob_provider, out)

    await service.update_progress(job.job_id, JobProgress())
    await service.finish(job.job_id, JobStatus.READY_TO_REVIEW, error=translation_error)


class TextbookRemediationConsumer(BaseConsumer):
    name = "TextbookRemediationConsumer"

    def __init__(self, db: AsyncDatabase) -> None:
        self._service = TextbookRemediationService(db)
        self._blob_provider: BlobStorageProvider | None = None

    async def _run_loop(self) -> None:
        if self._blob_provider is None:
            try:
                self._blob_provider = get_blob_storage_provider()
            except Exception:  # noqa: BLE001
                logger.exception(
                    "%s: BlobStorageProvider unavailable. Retrying in %ds.",
                    self.name, POLL_INTERVAL_SECONDS,
                )
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                return

        job = await self._service.claim_next_pending()
        if job is None:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            return

        await self._safe_process(job)

    async def process(self, job: RemediationJob) -> None:
        if self._blob_provider is None:
            raise PermanentError("BlobStorageProvider unavailable")
        try:
            await asyncio.wait_for(
                _process_job(job, self._service, self._blob_provider), timeout=JOB_TIMEOUT_SECONDS
            )
        except TimeoutError as exc:
            raise PermanentError(f"Remediation timed out after {JOB_TIMEOUT_SECONDS // 3600} hours. Upload a smaller PDF or try again.") from exc
        except RuntimeError as exc:
            logger.exception("remediation: failed job_id=%s", job.job_id)
            raise PermanentError(str(exc)) from exc

    async def _dead_letter(self, job: RemediationJob, reason: str) -> None:
        await self._service.finish(job.job_id, JobStatus.FAILED, error=reason)
        await self._service.update_progress(job.job_id, JobProgress())
