from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.models.remediation_job import ARTIFACTS, IMAGE_CONTENT_TYPES, ArtifactName, RemediationJob
from app.models.responses.remediation import (
    CreateRemediationJobResponse,
    FindingsPageResponse,
    RemediationJobListResponse,
    RemediationJobResponse,
    ReviewSummaryResponse,
)
from app.models.user import UserRole
from app.platform.auth.dependencies import require_role
from app.platform.error_handling import NotFoundError, ValidationError
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider, get_blob_storage_provider
from app.repositories.textbook_remediation_repository import (
    TextbookRemediationRepository,
    get_textbook_remediation_repo,
)
from app.services.language_registry import SUPPORTED_LANGUAGES
from app.services.textbook_remediation import (
    artifact_chunks as _artifact_chunks,
)
from app.services.textbook_remediation import (
    create_job,
    findings_page,
    review_summary,
    save_draft,
    serialize_job,
    subscribe,
    translate_job,
    verify_job,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/textbook-remediation", tags=["Textbook Remediation"])

require_remediation_access = require_role(
    UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value
)

MAX_PDF_BYTES = 200 * 1024 * 1024

_LANGUAGE_CODES = frozenset(lang["code"] for lang in SUPPORTED_LANGUAGES)


def _validate_language(value: str) -> None:
    if value not in _LANGUAGE_CODES:
        raise ValidationError(f"{value!r} is not a supported language. Pick a language from GET /v1/languages.")


class DraftUpdateRequest(BaseModel):
    draft_md: str


class VerifyJobRequest(BaseModel):
    title: str = ""


class TranslateJobRequest(BaseModel):
    target_language: str


async def _get_job(repo: TextbookRemediationRepository, tenant_id: str, job_id: str) -> RemediationJob:
    job = await repo.get(tenant_id, job_id)
    if job is None:
        raise NotFoundError("Remediation job", job_id)
    return job


@router.post("/jobs", status_code=202, response_model=CreateRemediationJobResponse, summary="Upload a textbook PDF and queue it for remediation")
async def create_remediation_job(
    file: UploadFile = File(..., description="The textbook PDF"),
    language: str = Form("en", description="Language the figure alt text is translated into"),
    target_language: str = Form("", description="When set, also translate the result into this language once remediation finishes"),
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, str]:
    if file.content_type != "application/pdf":
        raise ValidationError(f"Expected a PDF, got {file.content_type!r}")
    header = await file.read(5)
    if header != b"%PDF-":
        raise ValidationError("File is not a PDF")
    file.file.seek(0, 2)
    size = file.file.tell()
    if size > MAX_PDF_BYTES:
        raise ValidationError(f"PDF is larger than {MAX_PDF_BYTES // (1024 * 1024)} MB")
    await file.seek(0)
    if language != "auto":
        _validate_language(language)
    if target_language:
        _validate_language(target_language)

    job = await create_job(
        repo, blob_provider,
        tenant_id=str(user["tenant_id"]),
        source_name=file.filename or "textbook.pdf",
        data=file.file,
        language=language,
        target_language=target_language or None,
    )
    return {"job_id": job.job_id}


@router.get("/jobs", response_model=RemediationJobListResponse, summary="List remediation jobs")
async def list_remediation_jobs(
    limit: int = Query(20, ge=1, le=200),
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
) -> dict[str, list[dict[str, object]]]:
    jobs = await repo.list_jobs(str(user["tenant_id"]), limit=limit)
    return {"jobs": [serialize_job(job) for job in jobs]}


@router.delete("/jobs/{job_id}", status_code=204, summary="Soft-delete a remediation job")
async def delete_remediation_job(
    job_id: str,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
) -> None:
    deleted = await repo.soft_delete(str(user["tenant_id"]), job_id)
    if deleted is None:
        raise NotFoundError("Remediation job", job_id)


@router.get("/jobs/{job_id}", response_model=RemediationJobResponse, summary="Get a remediation job's status and artifacts")
async def get_remediation_job(
    job_id: str,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
) -> dict[str, object]:
    return serialize_job(await _get_job(repo, str(user["tenant_id"]), job_id))


@router.get("/jobs/{job_id}/stream", summary="SSE stream of live remediation progress")
async def stream_remediation_job(
    job_id: str,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
) -> StreamingResponse:
    tenant_id = str(user["tenant_id"])

    async def _format() -> AsyncIterator[str]:
        async for event in subscribe(repo, tenant_id, job_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(_format(), media_type="text/event-stream")


@router.get("/jobs/{job_id}/artifacts/{name}", summary="Download one artifact of a remediation job")
async def get_remediation_artifact(
    job_id: str,
    name: str,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> StreamingResponse:
    job = await _get_job(repo, str(user["tenant_id"]), job_id)
    chunks, content_type = await _artifact_chunks(job, name, blob_provider)
    return StreamingResponse(
        chunks,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{ARTIFACTS[ArtifactName(name)][0]}"'},
    )


@router.get("/jobs/{job_id}/images/{image_name}", summary="Serve an extracted figure image for a remediation job")
async def get_remediation_image(
    job_id: str,
    image_name: str,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> StreamingResponse:
    await _get_job(repo, str(user["tenant_id"]), job_id)

    safe_name = Path(image_name).name
    content_type = IMAGE_CONTENT_TYPES.get(Path(safe_name).suffix.lower())
    if content_type is None:
        raise NotFoundError("Image", safe_name)

    blob_path = f"textbook-remediation/{job_id}/images/{safe_name}"
    try:
        chunks = await blob_provider.download_chunks(get_settings().azure_storage_container, blob_path)
    except Exception:
        raise NotFoundError("Image", safe_name)

    return StreamingResponse(
        chunks,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/jobs/{job_id}/findings", response_model=FindingsPageResponse, summary="Paginated findings trail for a remediation job")
async def get_remediation_findings(
    job_id: str,
    name: str = Query("findings", description="Which trail to read: findings, alt, remediation or unresolved"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, object]:
    job = await _get_job(repo, str(user["tenant_id"]), job_id)
    return await findings_page(job, name, blob_provider, limit=limit, offset=offset)


@router.put("/jobs/{job_id}/draft", response_model=RemediationJobResponse, summary="Save user draft edits to the remediated document")
async def save_remediation_draft(
    job_id: str,
    payload: DraftUpdateRequest,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, object]:
    job = await _get_job(repo, str(user["tenant_id"]), job_id)
    return serialize_job(await save_draft(repo, blob_provider, job, payload.draft_md))


@router.post("/jobs/{job_id}/verify", response_model=RemediationJobResponse, summary="Mark a remediated document verified and save to library")
async def verify_remediation_job(
    job_id: str,
    payload: VerifyJobRequest,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, object]:
    job = await _get_job(repo, str(user["tenant_id"]), job_id)
    verified_by = str(user.get("email") or user.get("name") or user.get("id") or "reviewer")
    updated = await verify_job(repo, blob_provider, job, title=payload.title, verified_by=verified_by)
    return serialize_job(updated)


@router.post("/jobs/{job_id}/translate", response_model=RemediationJobResponse, summary="Translate a remediated document into another language")
async def translate_remediation_job(
    job_id: str,
    payload: TranslateJobRequest,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, object]:
    job = await _get_job(repo, str(user["tenant_id"]), job_id)
    _validate_language(payload.target_language)
    updated = await translate_job(repo, blob_provider, job, payload.target_language)
    return serialize_job(updated)


@router.get("/jobs/{job_id}/review-summary", response_model=ReviewSummaryResponse, summary="Aggregated review summary of figures, tables, and flags")
async def get_review_summary(
    job_id: str,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, object]:
    job = await _get_job(repo, str(user["tenant_id"]), job_id)
    return await review_summary(job, blob_provider)
