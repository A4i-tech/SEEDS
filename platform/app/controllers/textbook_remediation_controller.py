"""
Textbook remediation controller — /textbook-remediation/* endpoints.

Upload a textbook PDF, watch it move through OCR, review and remediation, and
read the artifacts each stage produced. The pipelines themselves run in the
consumer tier; this router only creates jobs and serves what the consumer wrote.

JSON responses are snake_case.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response, StreamingResponse

from app.models.remediation_job import ARTIFACTS, RemediationJob
from app.models.user import UserRole
from app.platform.auth.dependencies import require_role
from app.platform.error_handling import NotFoundError, ValidationError
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider, get_blob_storage_provider
from app.repositories.textbook_remediation_repository import (
    TextbookRemediationRepository,
    get_textbook_remediation_repo,
)
from app.services.textbook_remediation import serialize_job, subscribe

router = APIRouter(prefix="/textbook-remediation", tags=["Textbook Remediation"])

require_remediation_access = require_role(
    UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value
)

MAX_PDF_BYTES = 200 * 1024 * 1024

_LANGUAGE = re.compile(r"[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})?")

async def _get_job(repo: TextbookRemediationRepository, tenant_id: str, job_id: str) -> RemediationJob:
    job = await repo.get(tenant_id, job_id)
    if job is None:
        raise NotFoundError("Remediation job", job_id)
    return job


async def _artifact_bytes(job: RemediationJob, name: str, blob_provider: BlobStorageProvider) -> tuple[bytes, str]:
    if name not in ARTIFACTS:
        raise ValidationError(f"Unknown artifact {name!r}; expected one of {sorted(ARTIFACTS)}")
    url = job.artifacts.get(name)
    if url is None:
        raise NotFoundError("Artifact", f"{job.job_id}/{name}")
    return await blob_provider.download_from_url(url), ARTIFACTS[name][1]


@router.post("/jobs", status_code=202, summary="Upload a textbook PDF and queue it for remediation")
async def create_remediation_job(
    file: UploadFile = File(..., description="The textbook PDF"),
    language: str = Form("en", description="Language the figure alt text is translated into"),
    user: dict[str, Any] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, str]:
    if file.content_type != "application/pdf":
        raise ValidationError(f"Expected a PDF, got {file.content_type!r}")
    data = await file.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise ValidationError(f"PDF is larger than {MAX_PDF_BYTES // (1024 * 1024)} MB")
    if not data.startswith(b"%PDF-"):
        raise ValidationError("File is not a PDF")
    if not _LANGUAGE.fullmatch(language):
        raise ValidationError(f"Not a language tag: {language!r}")

    job_id = str(uuid.uuid4())
    url = await blob_provider.upload_file(
        get_settings().azure_storage_container, f"textbook-remediation/{job_id}/source.pdf", data, "application/pdf"
    )
    await repo.create(job_id, tenant_id=user.get("tenant_id", ""), source_name=file.filename or "textbook.pdf",
                      source_url=url, language=language)
    return {"job_id": job_id}


@router.get("/jobs", summary="List remediation jobs")
async def list_remediation_jobs(
    limit: int = Query(20, ge=1, le=200),
    user: dict[str, Any] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
) -> dict[str, Any]:
    jobs = await repo.list_jobs(user.get("tenant_id", ""), limit=limit)
    return {"jobs": [serialize_job(job) for job in jobs]}


@router.get("/jobs/{job_id}", summary="Get a remediation job's status and artifacts")
async def get_remediation_job(
    job_id: str,
    user: dict[str, Any] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
) -> dict[str, Any]:
    return serialize_job(await _get_job(repo, user.get("tenant_id", ""), job_id))


@router.get("/jobs/{job_id}/stream", summary="SSE stream of live remediation progress")
async def stream_remediation_job(
    job_id: str,
    user: dict[str, Any] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
) -> StreamingResponse:
    tenant_id = user.get("tenant_id", "")

    async def _format() -> Any:
        async for event in subscribe(repo, tenant_id, job_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(_format(), media_type="text/event-stream")


@router.get("/jobs/{job_id}/artifacts/{name}", summary="Download one artifact of a remediation job")
async def get_remediation_artifact(
    job_id: str,
    name: str,
    user: dict[str, Any] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> Response:
    job = await _get_job(repo, user.get("tenant_id", ""), job_id)
    data, content_type = await _artifact_bytes(job, name, blob_provider)
    filename = ARTIFACTS[name][0]
    return Response(content=data, media_type=content_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/jobs/{job_id}/findings", summary="Paginated findings trail for a remediation job")
async def get_remediation_findings(
    job_id: str,
    name: str = Query("findings", description="Which trail to read: findings, alt, remediation or unresolved"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict[str, Any] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, Any]:
    job = await _get_job(repo, user.get("tenant_id", ""), job_id)
    data, _ = await _artifact_bytes(job, name, blob_provider)
    lines = [line for line in data.decode("utf-8").splitlines() if line.strip()]
    page = [json.loads(line) for line in lines[offset:offset + limit]]
    return {"findings": page, "total": len(lines), "offset": offset, "has_more": offset + limit < len(lines)}
