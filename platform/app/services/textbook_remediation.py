from __future__ import annotations

import asyncio
import json
import logging
import re
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path
from typing import IO

from azure.core.exceptions import ResourceNotFoundError
from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase

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
from app.models.user import UserRole
from app.platform.error_handling import ConflictError, NotFoundError, ValidationError
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.remediation.accuracy import score_edit
from app.remediation.edit_diff import edit_diff_pairs
from app.remediation.render import compile_docx_tex_pdf
from app.remediation.translate import run_translation
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository
from app.repositories.user_repository import UserRepository

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
        models=job.models,
        progress=job.progress,
        draft_remediated_md=job.draft_remediated_md,
        verified_at=job.verified_at,
        verified_by=job.verified_by,
        title=job.title,
        error=job.error,
        created_at=job.created_at,
        assigned_to=job.assigned_to,
        finished_at=job.finished_at,
        target_language=job.target_language,
        translation_error=job.translation_error,
        source_page_count=job.source_page_count,
        book_id=job.book_id,
        edit_accuracy=job.edit_accuracy,
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
    book_id: str | None = None,
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
        book_id=book_id,
    )


async def assign_job(
    db: AsyncDatabase,
    tenant_id: str,
    job_id: str,
    volunteer_id: str,
    force: bool = False,
) -> RemediationJob:
    repo = TextbookRemediationRepository(db)
    user_repo = UserRepository(db)
    volunteer = await user_repo.find_active_by_tenant_and_role(
        tenant_id, volunteer_id, UserRole.TEXTBOOK_REMEDIATION_VOLUNTEER.value
    )
    if volunteer is None:
        raise ValidationError(
            "volunteer_id must be an active textbook remediation volunteer in this tenant"
        )

    current = await repo.get(tenant_id, job_id)
    if current is None:
        raise NotFoundError("Remediation job", job_id)
    if current.assigned_to and current.assigned_to != volunteer_id and not force:
        raise ConflictError(f"job {job_id} is already assigned; pass force to reassign")

    updated = await repo.set_assignment(tenant_id, job_id, volunteer_id)
    if updated is None:
        raise NotFoundError("Remediation job", job_id)
    if force and current.assigned_to and current.assigned_to != volunteer_id:
        logger.warning(
            "remediation job reassigned",
            extra={"job_id": job_id, "from": current.assigned_to, "to": volunteer_id},
        )
    return updated


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


# The path of one image in a Markdown link, after "](images/".
_IMAGE_REF = re.compile(r'\]\(images/([^)\s"]+)')


async def fetch_images(job: RemediationJob, markdown: str, out_dir: Path, blob_provider: BlobStorageProvider) -> str:
    """Download the figures the Markdown shows into out_dir and point the links at them."""
    container = get_settings().azure_storage_container
    target = out_dir / "images" / job.job_id
    target.mkdir(parents=True, exist_ok=True)
    for name in {Path(n).name for n in _IMAGE_REF.findall(markdown)}:
        try:
            data = await blob_provider.download_file(container, f"textbook-remediation/{job.job_id}/images/{name}")
        except ResourceNotFoundError:
            logger.warning("Figure %s of job %s is missing; the document shows its description", name, job.job_id)
            continue
        (target / name).write_bytes(data)
    # One folder per job, so figures of two chapters can never share a file name.
    return _IMAGE_REF.sub(lambda m: f"](images/{job.job_id}/{Path(m.group(1)).name}", markdown)


def _compile_verified(markdown: str, out_dir: Path) -> tuple[Path, Path, Path | None]:
    out_docx = out_dir / artifact_filename(ArtifactName.DOCX)
    out_tex = out_dir / artifact_filename(ArtifactName.TEX)
    out_pdf = compile_docx_tex_pdf(markdown, out_dir, out_docx, out_tex, resource_root=out_dir)
    return out_docx, out_tex, out_pdf


async def verify_job(
    repo: TextbookRemediationRepository,
    blob_provider: BlobStorageProvider,
    job: RemediationJob,
    *,
    title: str,
    verified_by: str,
    edited_by: str,
) -> RemediationJob:
    previous_md = ""
    accuracy = None
    if ArtifactName.REMEDIATED in job.artifacts:
        remediated_bytes, _ = await artifact_bytes(job, ArtifactName.REMEDIATED, blob_provider)
        previous_md = remediated_bytes.decode("utf-8")
        # A job verified with no edits scores 100% against itself, so its length still counts in a book total.
        final_md = previous_md if job.draft_remediated_md is None else job.draft_remediated_md
        accuracy = await asyncio.to_thread(score_edit, previous_md, final_md)
    # With no machine output to compare against, the job has no score.
    if job.draft_remediated_md:
        with tempfile.TemporaryDirectory() as tmpdir:
            out_dir = Path(tmpdir)
            try:
                markdown = await fetch_images(job, job.draft_remediated_md, out_dir, blob_provider)
                out_docx, out_tex, out_pdf = await asyncio.to_thread(_compile_verified, markdown, out_dir)
            except Exception as exc:
                logger.error("Could not compile verified artifacts for job %s: %s", job.job_id, exc)
                raise ValidationError(f"Could not build the verified document: {exc}") from exc

            changes = [{"wrong": w, "right": r} for w, r in edit_diff_pairs(previous_md, job.draft_remediated_md)]
            await repo.record_edit(job.job_id, previous_md, job.draft_remediated_md, edited_by, changes, accuracy)
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
        accuracy=accuracy,
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
        diagrams_described_count=job.metrics.diagrams_described if job.metrics.diagrams_described is not None else len(diagrams),
        tables_fixed_count=job.metrics.tables_fixed if job.metrics.tables_fixed is not None else len(tables),
        flagged_items_count=job.metrics.flagged_items_count if job.metrics.flagged_items_count is not None else len(flagged_items),
        diagrams=diagrams,
        tables=tables,
        flagged_items=flagged_items,
    ).model_dump(mode="json")
    summary["incomplete"] = incomplete
    return summary
