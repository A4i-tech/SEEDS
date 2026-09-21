from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

from app.models.remediation_job import (
    ARTIFACTS,
    STAGES,
    ArtifactName,
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
from app.remediation.render import convert_docx_to_pdf, markdown_to_format, tag_tex_for_pdf_ua
from app.remediation.translate import run_translation
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.0
_TERMINAL: tuple[JobStatus, ...] = (
    JobStatus.READY_TO_REVIEW,
    JobStatus.VERIFIED,
    JobStatus.FAILED,
)


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
    ).model_dump(mode="json")


async def subscribe(
    repo: TextbookRemediationRepository, tenant_id: str, job_id: str, *, interval: float = POLL_INTERVAL_SECONDS
) -> AsyncIterator[dict[str, object]]:
    previous: dict[str, object] | None = None
    while True:
        job = await repo.get(tenant_id, job_id)
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
    data: bytes,
    language: str,
    target_language: str | None,
) -> RemediationJob:
    job_id = repo.new_job_id()
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


async def artifact_bytes(
    job: RemediationJob, name: str, blob_provider: BlobStorageProvider
) -> tuple[bytes, str]:
    try:
        artifact = ArtifactName(name)
    except ValueError as exc:
        expected = sorted(a.value for a in ArtifactName)
        raise ValidationError(f"Unknown artifact {name!r}; expected one of {expected}") from exc
    url = job.artifacts.get(artifact)
    if url is None:
        raise NotFoundError("Artifact", f"{job.job_id}/{name}")
    return await blob_provider.download_from_url(url), ARTIFACTS[artifact][1]


async def findings_page(
    job: RemediationJob, name: str, blob_provider: BlobStorageProvider, *, limit: int, offset: int
) -> dict[str, object]:
    data, _ = await artifact_bytes(job, name, blob_provider)
    lines = [line for line in data.decode("utf-8").splitlines() if line.strip()]
    page = [json.loads(line) for line in lines[offset:offset + limit]]
    return FindingsPageResponse(
        findings=page, total=len(lines), offset=offset, has_more=offset + limit < len(lines)
    ).model_dump(mode="json")


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
    out_docx = out_dir / "remediated.docx"
    markdown_to_format(markdown, "docx", out_docx)
    out_tex = out_dir / "remediated.tex"
    markdown_to_format(markdown, "latex", out_tex)
    tag_tex_for_pdf_ua(out_tex)
    out_pdf = convert_docx_to_pdf(out_docx, out_dir) if out_docx.exists() else None
    return out_docx, out_tex, out_pdf


async def verify_job(
    repo: TextbookRemediationRepository,
    blob_provider: BlobStorageProvider,
    job: RemediationJob,
    *,
    title: str,
    verified_by: str,
) -> RemediationJob:
    if job.draft_remediated_md:
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
                    verified[name] = await blob_provider.upload_file(
                        container,
                        f"textbook-remediation/{job.job_id}/{ARTIFACTS[name][0]}",
                        out_path.read_bytes(),
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
    translated_urls = await run_translation(
        job.job_id, remediated_bytes, target_language, job.language, blob_provider
    )
    if not translated_urls:
        raise ValidationError("Translation produced no downloadable file. Try again, or pick a different target language.")
    updated = await repo.record_artifacts(job.job_id, translated_urls, {})
    await repo.set_translation_error(job.job_id, None)
    if updated is None:
        raise NotFoundError("Remediation job", job.job_id)
    return updated


def _parse_jsonl(data: bytes) -> list[dict[str, object]]:
    return [json.loads(line) for line in data.decode("utf-8").splitlines() if line.strip()]


async def review_summary(job: RemediationJob, blob_provider: BlobStorageProvider) -> dict[str, object]:
    diagrams: list[DiagramResponse] = []
    if ArtifactName.ALT in job.artifacts:
        try:
            data, _ = await artifact_bytes(job, ArtifactName.ALT, blob_provider)
            for item in _parse_jsonl(data):
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

    flagged_items: list[FlaggedItemResponse] = []
    if ArtifactName.UNRESOLVED in job.artifacts:
        try:
            data, _ = await artifact_bytes(job, ArtifactName.UNRESOLVED, blob_provider)
            for item in _parse_jsonl(data):
                flagged_items.append(
                    FlaggedItemResponse(
                        id=str(item.get("id") or f"flag_{len(flagged_items) + 1}"),
                        page=item.get("page", 1),
                        type="unresolved_figure",
                        text=str(item.get("text") or item.get("alt_text") or ""),
                        reason=str(item.get("reason") or "Needs manual check"),
                        needs_check=True,
                    )
                )
        except Exception as exc:
            logger.warning("Failed to parse unresolved artifact for job %s: %s", job.job_id, exc)

    tables: list[dict[str, object]] = []
    if ArtifactName.REMEDIATION in job.artifacts:
        try:
            data, _ = await artifact_bytes(job, ArtifactName.REMEDIATION, blob_provider)
            for item in _parse_jsonl(data):
                rule = str(item.get("rule") or "")
                if rule == "table_summary" or "table" in rule:
                    tables.append(item)
        except Exception as exc:
            logger.warning("Failed to parse remediation artifact for job %s: %s", job.job_id, exc)

    return ReviewSummaryResponse(
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
