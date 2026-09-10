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
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

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


class DraftUpdateRequest(BaseModel):
    draft_md: str
    figure_overrides: dict[str, object] | None = None


class VerifyJobRequest(BaseModel):
    title: str | None = None
    subject: str | None = None
    grade: int | None = None
    publish_to_library: bool = True

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
    user: dict[str, object] = Depends(require_remediation_access),
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
    await repo.create(job_id, tenant_id=str(user.get("tenant_id", "")), source_name=file.filename or "textbook.pdf",
                      source_url=url, language=language)
    return {"job_id": job_id}


@router.get("/jobs", summary="List remediation jobs")
async def list_remediation_jobs(
    limit: int = Query(20, ge=1, le=200),
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
) -> dict[str, list[dict[str, object]]]:
    jobs = await repo.list_jobs(str(user.get("tenant_id", "")), limit=limit)
    return {"jobs": [serialize_job(job) for job in jobs]}


@router.get("/jobs/{job_id}", summary="Get a remediation job's status and artifacts")
async def get_remediation_job(
    job_id: str,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
) -> dict[str, object]:
    return serialize_job(await _get_job(repo, str(user.get("tenant_id", "")), job_id))


@router.get("/jobs/{job_id}/stream", summary="SSE stream of live remediation progress")
async def stream_remediation_job(
    job_id: str,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
) -> StreamingResponse:
    tenant_id = str(user.get("tenant_id", ""))

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
) -> Response:
    job = await _get_job(repo, str(user.get("tenant_id", "")), job_id)
    data, content_type = await _artifact_bytes(job, name, blob_provider)
    filename = ARTIFACTS[name][0]
    return Response(content=data, media_type=content_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/jobs/{job_id}/images/{image_name}", summary="Serve an extracted figure image for a remediation job")
async def get_remediation_image(
    job_id: str,
    image_name: str,
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> Response:
    safe_name = Path(image_name).name
    ext = Path(safe_name).suffix.lower()
    content_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
    }
    content_type = content_types.get(ext, "image/jpeg")

    blob_path = f"textbook-remediation/{job_id}/images/{safe_name}"
    try:
        data = await blob_provider.download_file(get_settings().azure_storage_container, blob_path)
    except Exception:
        raise HTTPException(status_code=404, detail="Image not found")

    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )



@router.get("/jobs/{job_id}/findings", summary="Paginated findings trail for a remediation job")
async def get_remediation_findings(
    job_id: str,
    name: str = Query("findings", description="Which trail to read: findings, alt, remediation or unresolved"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, object]:
    job = await _get_job(repo, str(user.get("tenant_id", "")), job_id)
    data, _ = await _artifact_bytes(job, name, blob_provider)
    lines = [line for line in data.decode("utf-8").splitlines() if line.strip()]
    page = [json.loads(line) for line in lines[offset:offset + limit]]
    return {"findings": page, "total": len(lines), "offset": offset, "has_more": offset + limit < len(lines)}


@router.put("/jobs/{job_id}/draft", summary="Save user draft edits to the remediated document")
async def save_remediation_draft(
    job_id: str,
    payload: DraftUpdateRequest,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, object]:
    job = await _get_job(repo, str(user.get("tenant_id", "")), job_id)
    container = get_settings().azure_storage_container
    draft_bytes = payload.draft_md.encode("utf-8")
    url = await blob_provider.upload_file(
        container, f"textbook-remediation/{job_id}/remediated.draft.md", draft_bytes, "text/markdown"
    )
    updated = await repo.update_draft(job_id, payload.draft_md, url)
    return serialize_job(updated or job)


@router.post("/jobs/{job_id}/verify", summary="Mark a remediated document verified and save to library")
async def verify_remediation_job(
    job_id: str,
    payload: VerifyJobRequest,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, object]:
    job = await _get_job(repo, str(user.get("tenant_id", "")), job_id)
    verified_by = str(user.get("email") or user.get("name") or user.get("id") or "reviewer")

    docx_url = job.artifacts.get("docx")
    if job.draft_remediated_md:
        try:
            import tempfile

            import pypandoc

            with tempfile.TemporaryDirectory() as tmpdir:
                out_docx = Path(tmpdir) / "remediated.verified.docx"
                pypandoc.convert_text(
                    job.draft_remediated_md,
                    "docx",
                    format="markdown+tex_math_dollars",
                    outputfile=str(out_docx),
                )
                if out_docx.exists():
                    container = get_settings().azure_storage_container
                    docx_url = await blob_provider.upload_file(
                        container,
                        f"textbook-remediation/{job_id}/remediated.docx",
                        out_docx.read_bytes(),
                        ARTIFACTS["docx"][1],
                    )
        except Exception:
            pass

    title = payload.title or job.source_name.replace(".pdf", " (Accessible)")
    updated = await repo.mark_verified(
        job_id,
        verified_by=verified_by,
        title=title,
        docx_url=docx_url,
    )
    return serialize_job(updated or job)


@router.get("/jobs/{job_id}/review-summary", summary="Aggregated review summary of figures, tables, and flags")
async def get_review_summary(
    job_id: str,
    user: dict[str, object] = Depends(require_remediation_access),
    repo: TextbookRemediationRepository = Depends(get_textbook_remediation_repo),
    blob_provider: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> dict[str, object]:
    job = await _get_job(repo, str(user.get("tenant_id", "")), job_id)

    diagrams = []
    if "alt" in job.artifacts:
        try:
            data, _ = await _artifact_bytes(job, "alt", blob_provider)
            for line in data.decode("utf-8").splitlines():
                if line.strip():
                    item = json.loads(line)
                    diagrams.append(
                        {
                            "id": item.get("id") or item.get("image_name") or f"diag_{len(diagrams)+1}",
                            "page": item.get("page", 1),
                            "image_name": item.get("image_name") or item.get("src", ""),
                            "alt_text": item.get("alt_text") or item.get("replacement") or "",
                            "status": item.get("status", "described"),
                            "needs_check": False,
                        }
                    )
        except Exception:
            pass

    flagged_items = []
    if "unresolved" in job.artifacts:
        try:
            data, _ = await _artifact_bytes(job, "unresolved", blob_provider)
            for line in data.decode("utf-8").splitlines():
                if line.strip():
                    item = json.loads(line)
                    flagged_items.append(
                        {
                            "id": item.get("id") or f"flag_{len(flagged_items)+1}",
                            "page": item.get("page", 1),
                            "type": "unresolved_figure",
                            "text": item.get("text") or item.get("alt_text") or "",
                            "reason": item.get("reason", "Needs manual check"),
                            "needs_check": True,
                        }
                    )
        except Exception:
            pass

    tables = []
    if "remediation" in job.artifacts:
        try:
            data, _ = await _artifact_bytes(job, "remediation", blob_provider)
            for line in data.decode("utf-8").splitlines():
                if line.strip():
                    item = json.loads(line)
                    if item.get("rule") == "table_summary" or "table" in item.get("rule", ""):
                        tables.append(item)
        except Exception:
            pass

    total_pages = (job.metrics or {}).get("total_pages", (job.counts or {}).get("total_pages", 1))
    diagrams_count = (job.metrics or {}).get("diagrams_described", len(diagrams))
    tables_count = (job.metrics or {}).get("tables_fixed", len(tables))
    flagged_count = (job.metrics or {}).get("flagged_items_count", len(flagged_items))

    return {
        "job_id": job_id,
        "status": job.status,
        "total_pages": total_pages,
        "diagrams_described_count": diagrams_count,
        "tables_fixed_count": tables_count,
        "flagged_items_count": flagged_count,
        "diagrams": diagrams,
        "tables": tables,
        "flagged_items": flagged_items,
    }

