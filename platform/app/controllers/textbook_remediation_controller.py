from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.models.remediation_job import AssignJobRequest
from app.models.requests.textbook_requests import (
    CreateJobRequest,
    DraftUpdateRequest,
    TranslateJobRequest,
    VerifyJobRequest,
)
from app.models.responses.remediation import (
    CreateRemediationJobResponse,
    FindingsPageResponse,
    RemediationJobListResponse,
    RemediationJobResponse,
    ReviewSummaryResponse,
)
from app.models.user import UserRole
from app.platform.auth.dependencies import require_role, require_tenant
from app.services.textbook_book import TextbookBookService, get_textbook_book_service
from app.services.textbook_remediation import (
    TextbookRemediationService,
    get_textbook_remediation_service,
)

router = APIRouter(prefix="/textbook-remediation", tags=["Textbook Remediation"])

require_remediation_access = require_role(
    UserRole.TENANT.value,
    UserRole.SCHOOL_ADMIN.value,
    UserRole.CONTENT_CREATOR.value,
    UserRole.TEXTBOOK_REMEDIATION_VOLUNTEER.value,
)


@router.post("/jobs", status_code=202, response_model=CreateRemediationJobResponse, summary="Upload a textbook PDF and queue it for remediation")
async def create_remediation_job(
    payload: Annotated[CreateJobRequest, Form()],
    file: UploadFile = File(..., description="The textbook PDF"),
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> CreateRemediationJobResponse:
    return await service.create(str(user["tenant_id"]), file=file, payload=payload)


@router.get("/jobs", response_model=RemediationJobListResponse, summary="List remediation jobs")
async def list_remediation_jobs(
    limit: int = Query(20, ge=1, le=200),
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookBookService = Depends(get_textbook_book_service),
) -> RemediationJobListResponse:
    tenant_id = str(user["tenant_id"])
    volunteer = user["role"] == UserRole.TEXTBOOK_REMEDIATION_VOLUNTEER.value

    return await service.list_jobs_with_books(
        tenant_id, volunteer=volunteer, assigned_to=str(user["sub"]) if volunteer else "", limit=limit,
    )


@router.delete("/jobs/{job_id}", status_code=204, summary="Soft-delete a remediation job")
async def delete_remediation_job(
    job_id: str,
    user: dict[str, object] = Depends(require_tenant),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> None:
    await service.remove(str(user["tenant_id"]), job_id)


@router.get("/jobs/{job_id}", response_model=RemediationJobResponse, summary="Get a remediation job's status and artifacts")
async def get_remediation_job(
    job_id: str,
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> RemediationJobResponse:
    return await service.get(user, job_id)


@router.get("/jobs/{job_id}/stream", summary="SSE stream of live remediation progress")
async def stream_remediation_job(
    job_id: str,
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> StreamingResponse:
    await service.require_job(user, job_id)

    return StreamingResponse(service.events(user, job_id), media_type="text/event-stream")


@router.get("/jobs/{job_id}/artifacts/{name}", summary="Download one artifact of a remediation job")
async def get_remediation_artifact(
    job_id: str,
    name: str,
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> StreamingResponse:
    return await service.artifact(user, job_id, name)


@router.get("/jobs/{job_id}/images/{image_name}", summary="Serve an extracted figure image for a remediation job")
async def get_remediation_image(
    job_id: str,
    image_name: str,
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> StreamingResponse:
    return await service.image(user, job_id, image_name)


@router.get("/jobs/{job_id}/pages/{page_num}", summary="Serve one rendered page of the original scan for a remediation job")
async def get_remediation_page(
    job_id: str,
    page_num: int,
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> StreamingResponse:
    return await service.page(user, job_id, page_num)


@router.get("/jobs/{job_id}/findings", response_model=FindingsPageResponse, summary="Paginated findings trail for a remediation job")
async def get_remediation_findings(
    job_id: str,
    name: str = Query("findings", description="Which trail to read: findings, alt, remediation or unresolved"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> FindingsPageResponse:
    return await service.findings(user, job_id, name, limit, offset)


@router.put("/jobs/{job_id}/draft", response_model=RemediationJobResponse, summary="Save user draft edits to the remediated document")
async def save_remediation_draft(
    job_id: str,
    payload: DraftUpdateRequest,
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> RemediationJobResponse:
    return await service.save(user, job_id, payload.draft_md)


@router.post("/jobs/{job_id}/verify", response_model=RemediationJobResponse, summary="Mark a remediated document verified and save to library")
async def verify_remediation_job(
    job_id: str,
    payload: VerifyJobRequest,
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> RemediationJobResponse:
    return await service.verify(user, job_id, payload.title)


@router.post("/jobs/{job_id}/translate", response_model=RemediationJobResponse, summary="Translate a remediated document into another language")
async def translate_remediation_job(
    job_id: str,
    payload: TranslateJobRequest,
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> RemediationJobResponse:
    return await service.translate(user, job_id, payload.target_language)


@router.get("/jobs/{job_id}/review-summary", response_model=ReviewSummaryResponse, summary="Aggregated review summary of figures, tables, and flags")
async def get_review_summary(
    job_id: str,
    user: dict[str, object] = Depends(require_remediation_access),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> ReviewSummaryResponse:
    return await service.review(user, job_id)


@router.put(
    "/jobs/{job_id}/assignment",
    response_model=RemediationJobResponse,
    summary="Assign or unassign a remediation job to a volunteer",
)
async def assign_remediation_job(
    job_id: str,
    payload: AssignJobRequest,
    user: dict[str, object] = Depends(require_tenant),
    service: TextbookRemediationService = Depends(get_textbook_remediation_service),
) -> RemediationJobResponse:
    return await service.assign(
        str(user["tenant_id"]), job_id, payload.volunteer_id, payload.force
    )
