from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import IO

from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase

from app.models.remediation_job import (
    ARTIFACTS,
    STAGES,
    ArtifactName,
    JobMetrics,
    JobModels,
    JobProgress,
    JobStage,
    JobStatus,
    RemediationJob,
    artifact_filename,
)
from app.models.responses.remediation import (
    DiagramResponse,
    FindingsPageResponse,
    FlaggedItemResponse,
    RemediationJobResponse,
    ReviewSummaryResponse,
)
from app.platform.error_handling import NotFoundError, ValidationError
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.remediation.render import compile_docx_tex_pdf
from app.remediation.translate import run_translation
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.0
_TERMINAL: tuple[JobStatus, ...] = (
    JobStatus.READY_TO_REVIEW,
    JobStatus.VERIFIED,
    JobStatus.FAILED,
)


class TextbookRemediationService:
    def __init__(self, db: AsyncDatabase) -> None:
        self._repo = TextbookRemediationRepository(db)

    async def claim_next_pending(self) -> RemediationJob | None:
        return await self._repo.claim_next_pending()

    async def update_progress(self, job_id: str, progress: JobProgress) -> RemediationJob | None:
        return await self._repo.update_progress(job_id, progress)

    async def update_source_page_count(self, job_id: str, page_count: int) -> RemediationJob | None:
        return await self._repo.update_source_page_count(job_id, page_count)

    async def update_models(self, job_id: str, models: JobModels) -> RemediationJob | None:
        return await self._repo.update_models(job_id, models)

    async def set_stage(self, job_id: str, stage: JobStage) -> RemediationJob | None:
        return await self._repo.set_stage(job_id, stage)

    async def update_language(self, job_id: str, language: str) -> RemediationJob | None:
        return await self._repo.update_language(job_id, language)

    async def record_artifacts(
        self, job_id: str, artifacts: dict[ArtifactName, str], counts: dict[str, int]
    ) -> RemediationJob | None:
        return await self._repo.record_artifacts(job_id, artifacts, counts)

    async def update_metrics(self, job_id: str, metrics: JobMetrics) -> RemediationJob | None:
        return await self._repo.update_metrics(job_id, metrics)

    async def set_translation_error(self, job_id: str, message: str | None) -> RemediationJob | None:
        return await self._repo.set_translation_error(job_id, message)

    async def finish(self, job_id: str, status: JobStatus, *, error: str | None = None) -> RemediationJob | None:
        return await self._repo.finish(job_id, status, error=error)


def serialize_job(job: RemediationJob) -> dict[str, object]:
    return RemediationJobResponse(
        job_id=job.job_id,
        source_name=job.source_name,
        language=job.language,
        detected_language=job.detected_language,
        status=job.status,
        stage=job.stage,
        stage_index=STAGES.index(job.stage) + 1 if job.stage in STAGES else 0,
        stage_count=len(STAGES),
        artifacts=job.artifacts,
        counts=job.counts,
        metrics=job.metrics,
        models=job.models,
        progress=job.progress,
        draft_remediated_md=job.draft_remediated_md,
        verified_at=job.verified_at,
        verified_by=job.verified_by,
        title=job.title,
        error=job.error,
        created_at=job.created_at,
        finished_at=job.finished_at,
        target_language=job.target_language,
        translation_error=job.translation_error,
        source_page_count=job.source_page_count,
    ).model_dump(mode="json")


async def subscribe(
    repo: TextbookRemediationRepository, tenant_id: str, job_id: str, *, interval: float = POLL_INTERVAL_SECONDS
) -> AsyncIterator[dict[str, object]]:
    previous: dict[str, object] | None = None
    while True:
        job = await repo.get(tenant_id, job_id, include_draft=False)
        if job is None:
            return
        payload = serialize_job(job)
        if job.status in _TERMINAL:
            yield {"event": "done", "job": payload}
            return
        if payload != previous:
            yield {"event": "progress", "job": payload}
            previous = payload
        await asyncio.sleep(interval if interval > 0 else 0)


async def create_job(
    repo: TextbookRemediationRepository,
    blob_provider: BlobStorageProvider,
    *,
    tenant_id: str,
    source_name: str,
    data: IO[bytes],
    language: str,
    target_language: str | None,
) -> RemediationJob:
    job_id = ObjectId()
    url = await blob_provider.upload_file(
        get_settings().azure_storage_container, f"textbook-remediation/{job_id}/source.pdf", data, "application/pdf"
    )
    return await repo.create(
        job_id=job_id,
        tenant_id=tenant_id,
        source_name=source_name,
        source_url=url,
        language=language,
        target_language=target_language,
    )


def _resolve_artifact(job: RemediationJob, name: str) -> tuple[ArtifactName, str]:
    try:
        artifact = ArtifactName(name)
    except ValueError as exc:
        expected = sorted(a.value for a in ArtifactName)
        raise ValidationError(f"Unknown artifact {name!r}; expected one of {expected}") from exc
    url = job.source_url if artifact == ArtifactName.SOURCE else job.artifacts.get(artifact)
    if url is None:
        raise NotFoundError("Artifact", f"{job.job_id}/{name}")
    return artifact, url


async def artifact_bytes(
    job: RemediationJob, name: str, blob_provider: BlobStorageProvider
) -> tuple[bytes, str]:
    artifact, url = _resolve_artifact(job, name)
    return await blob_provider.download_from_url(url), ARTIFACTS[artifact][1]


async def artifact_chunks(
    job: RemediationJob, name: str, blob_provider: BlobStorageProvider
) -> tuple[AsyncIterator[bytes], str]:
    artifact, url = _resolve_artifact(job, name)
    chunks = await blob_provider.download_chunks_from_url(url)
    return chunks, ARTIFACTS[artifact][1]


async def _iter_jsonl_lines(chunks: AsyncIterator[bytes]) -> AsyncIterator[str]:
    buffer = b""
    async for chunk in chunks:
        *lines, buffer = (buffer + chunk).split(b"\n")
        for line in lines:
            if line.strip():
                yield line.decode("utf-8")
    if buffer.strip():
        yield buffer.decode("utf-8")


async def _iter_artifact_jsonl(
    job: RemediationJob, name: str, blob_provider: BlobStorageProvider
) -> AsyncIterator[dict[str, object]]:
    _artifact, url = _resolve_artifact(job, name)
    chunks = await blob_provider.download_chunks_from_url(url)
    async for line in _iter_jsonl_lines(chunks):
        yield json.loads(line)


async def findings_page(
    job: RemediationJob, name: str, blob_provider: BlobStorageProvider, *, limit: int, offset: int
) -> dict[str, object]:
    page: list[dict[str, object]] = []
    total = 0
    async for item in _iter_artifact_jsonl(job, name, blob_provider):
        if offset <= total < offset + limit:
            page.append(item)
        total += 1
    return FindingsPageResponse(
        findings=page, total=total, offset=offset, has_more=offset + limit < total
    ).model_dump(mode="json")


async def _append_edit_record(
    blob_provider: BlobStorageProvider,
    job: RemediationJob,
    previous_md: str,
    new_md: str,
    edited_by: str | None,
) -> str:
    container = get_settings().azure_storage_container
    blob_name = f"textbook-remediation/{job.job_id}/{artifact_filename(ArtifactName.EDITS)}"
    existing_url = job.artifacts.get(ArtifactName.EDITS)
    existing = await blob_provider.download_from_url(existing_url) if existing_url else b""
    record = json.dumps({
        "timestamp": datetime.now(UTC).isoformat(),
        "edited_by": edited_by,
        "previous": previous_md,
        "new": new_md,
    })
    return await blob_provider.upload_file(
        container, blob_name, existing + (record + "\n").encode("utf-8"), ARTIFACTS[ArtifactName.EDITS][1]
    )


async def save_draft(
    repo: TextbookRemediationRepository,
    blob_provider: BlobStorageProvider,
    job: RemediationJob,
    draft_md: str,
) -> RemediationJob:
    url = await blob_provider.upload_file(
        get_settings().azure_storage_container,
        f"textbook-remediation/{job.job_id}/{artifact_filename(ArtifactName.DRAFT)}",
        draft_md.encode("utf-8"),
        "text/markdown",
    )
    updated = await repo.update_draft(job.job_id, draft_md, url)
    if updated is None:
        raise NotFoundError("Remediation job", job.job_id)
    return updated


def _compile_verified(markdown: str, out_dir: Path) -> tuple[Path, Path, Path | None]:
    out_docx = out_dir / artifact_filename(ArtifactName.DOCX)
    out_tex = out_dir / artifact_filename(ArtifactName.TEX)
    out_pdf = compile_docx_tex_pdf(markdown, out_dir, out_docx, out_tex)
    return out_docx, out_tex, out_pdf


async def verify_job(
    repo: TextbookRemediationRepository,
    blob_provider: BlobStorageProvider,
    job: RemediationJob,
    *,
    title: str,
    verified_by: str,
    edited_by: str | None = None,
) -> RemediationJob:
    if job.draft_remediated_md:
        if ArtifactName.REMEDIATED in job.artifacts:
            remediated_bytes, _ = await artifact_bytes(job, ArtifactName.REMEDIATED, blob_provider)
            previous_md = remediated_bytes.decode("utf-8")
        else:
            previous_md = ""
        edits_url = await _append_edit_record(blob_provider, job, previous_md, job.draft_remediated_md, edited_by)
        await repo.record_artifacts(job.job_id, {ArtifactName.EDITS: edits_url}, {})
        with tempfile.TemporaryDirectory() as tmpdir:
            out_dir = Path(tmpdir)
            try:
                out_docx, out_tex, out_pdf = await asyncio.to_thread(_compile_verified, job.draft_remediated_md, out_dir)
            except Exception as exc:
                logger.error("Could not compile verified artifacts for job %s: %s", job.job_id, exc)
                raise ValidationError(f"Could not build the verified document: {exc}") from exc

            container = get_settings().azure_storage_container
            verified: dict[str, str] = {}
            for name, out_path in (
                (ArtifactName.DOCX, out_docx),
                (ArtifactName.TEX, out_tex),
                (ArtifactName.PDF, out_pdf),
            ):
                if out_path and out_path.exists():
                    with out_path.open("rb") as fh:
                        verified[name] = await blob_provider.upload_file(
                            container,
                            f"textbook-remediation/{job.job_id}/verified/{ARTIFACTS[name][0]}",
                            fh,
                            ARTIFACTS[name][1],
                        )
            if verified:
                await repo.record_artifacts(job.job_id, verified, {})

    updated = await repo.mark_verified(
        job.job_id,
        verified_by=verified_by,
        title=title or job.source_name.replace(".pdf", " (Accessible)"),
    )
    if updated is None:
        raise NotFoundError("Remediation job", job.job_id)
    return updated


async def translate_job(
    repo: TextbookRemediationRepository,
    blob_provider: BlobStorageProvider,
    job: RemediationJob,
    target_language: str,
) -> RemediationJob:
    remediated_bytes, _ = await artifact_bytes(job, ArtifactName.REMEDIATED, blob_provider)
    try:
        with tempfile.TemporaryDirectory() as workspace:
            remediated_path = Path(workspace) / "remediated.md"
            remediated_path.write_bytes(remediated_bytes)
            translated_urls = await run_translation(
                job.job_id, remediated_path, target_language, job.language, blob_provider
            )
        if not translated_urls:
            raise ValidationError("Translation produced no downloadable file. Try again, or pick a different target language.")
    except ValueError as exc:
        await repo.set_translation_error(job.job_id, str(exc))
        raise ValidationError(str(exc)) from exc
    except Exception as exc:
        await repo.set_translation_error(job.job_id, str(exc))
        raise
    updated = await repo.record_artifacts(job.job_id, translated_urls, {})
    await repo.set_translation_error(job.job_id, None)
    if updated is None:
        raise NotFoundError("Remediation job", job.job_id)
    return updated


async def review_summary(job: RemediationJob, blob_provider: BlobStorageProvider) -> dict[str, object]:
    incomplete = False
    diagrams: list[DiagramResponse] = []
    if ArtifactName.ALT in job.artifacts:
        try:
            async for item in _iter_artifact_jsonl(job, ArtifactName.ALT, blob_provider):
                diagrams.append(
                    DiagramResponse(
                        id=str(item.get("id") or item.get("image_name") or f"diag_{len(diagrams) + 1}"),
                        page=item.get("page", 1),
                        image_name=str(item.get("image_name") or item.get("src") or ""),
                        alt_text=str(item.get("alt_text") or item.get("replacement") or ""),
                        status=str(item.get("status") or "described"),
                        needs_check=False,
                    )
                )
        except Exception as exc:
            logger.warning("Failed to parse alt artifact for job %s: %s", job.job_id, exc)
            incomplete = True

    flagged_items: list[FlaggedItemResponse] = []
    if ArtifactName.UNRESOLVED in job.artifacts:
        try:
            async for item in _iter_artifact_jsonl(job, ArtifactName.UNRESOLVED, blob_provider):
                flagged_items.append(
                    FlaggedItemResponse(
                        id=str(item.get("id") or f"flag_{len(flagged_items) + 1}"),
                        page=item.get("page", 1),
                        type=str(item.get("type") or "unresolved_figure"),
                        text=str(item.get("text") or item.get("alt_text") or ""),
                        reason=str(item.get("reason") or "Needs manual check"),
                        needs_check=True,
                    )
                )
        except Exception as exc:
            logger.warning("Failed to parse unresolved artifact for job %s: %s", job.job_id, exc)
            incomplete = True

    tables: list[dict[str, object]] = []
    if ArtifactName.REMEDIATION in job.artifacts:
        try:
            async for item in _iter_artifact_jsonl(job, ArtifactName.REMEDIATION, blob_provider):
                rule = str(item.get("rule") or "")
                if rule == "table_summary" or "table" in rule:
                    tables.append(item)
        except Exception as exc:
            logger.warning("Failed to parse remediation artifact for job %s: %s", job.job_id, exc)
            incomplete = True

    summary = ReviewSummaryResponse(
        job_id=job.job_id,
        status=job.status,
        total_pages=job.metrics.total_pages or 1,
        diagrams_described_count=job.metrics.diagrams_described or len(diagrams),
        tables_fixed_count=job.metrics.tables_fixed or len(tables),
        flagged_items_count=job.metrics.flagged_items_count or len(flagged_items),
        diagrams=diagrams,
        tables=tables,
        flagged_items=flagged_items,
    ).model_dump(mode="json")
    summary["incomplete"] = incomplete
    return summary
