"""
School controller — school management.

Ported from backend-server/src/routes/schoolRouter.js.

Class routes have been split into class_controller.py.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, status

from app.models.requests.school_requests import (
    SchoolAnalyticsRequest,
    SchoolCreateRequest,
    SchoolUpdateRequest,
    TeacherTransferRequest,
)
from app.models.responses.analytics_response import AnalyticsResponse
from app.models.responses.login import MessageResponse
from app.models.responses.school_response import SchoolResponse
from app.models.responses.teacher import TeacherTransferResponse
from app.models.responses.user import UserPublicResponse
from app.platform.auth.dependencies import (
    get_current_user,
    require_role,
    require_tenant,
)
from app.services.school_service import SchoolService, get_school_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/school", tags=["School"])


@router.post(
    "",
    summary="Create a new school (tenant only)",
    status_code=status.HTTP_201_CREATED,
)
async def create_school(
    body: SchoolCreateRequest,
    current_user: dict[str, Any] = Depends(require_tenant),
    service: SchoolService = Depends(get_school_service),
) -> SchoolResponse:
    school = await service.create_school(
        name=body.name,
        email=body.email,
        tenant_id=current_user["sub"],
        plain_password=body.password,
    )
    return SchoolResponse.from_domain(school)


@router.get(
    "",
    summary="List schools for current tenant",
    status_code=status.HTTP_200_OK,
)
async def list_schools(
    current_user: dict[str, Any] = Depends(get_current_user),
    service: SchoolService = Depends(get_school_service),
) -> list[SchoolResponse]:
    if current_user.get("role") == "tenant":
        tenant_id: str = current_user.get("sub", "")
    else:
        tenant_id = current_user.get("tenant_id", "")

    schools = await service.list_schools_by_tenant(tenant_id)
    return [SchoolResponse.from_domain(s) for s in schools]


@router.get(
    "/teachers",
    summary="List teachers in the admin's school (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def school_teachers(
    current_user: dict[str, Any] = Depends(require_role("school_admin", "content_creator")),
    service: SchoolService = Depends(get_school_service),
) -> list[dict[str, Any]]:
    school_id = current_user.get("school_id", "")
    tenant_id = current_user.get("tenant_id", "")
    if not school_id:
        return []
    return await service.list_teachers_by_school(school_id, tenant_id)


@router.post(
    "/transfer",
    summary="Transfer a teacher to another school (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def transfer_teacher(
    body: TeacherTransferRequest,
    current_user: dict[str, Any] = Depends(require_role("school_admin", "content_creator")),
    service: SchoolService = Depends(get_school_service),
) -> TeacherTransferResponse:
    teacher = await service.transfer_teacher(
        body.teacherId, body.targetSchoolId, current_user["tenant_id"]
    )
    return TeacherTransferResponse(
        message="Teacher transferred successfully",
        teacher=UserPublicResponse.from_domain(teacher).to_response(),
    )


@router.get(
    "/dashboard",
    summary="Get school dashboard (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def school_dashboard(
    current_user: dict[str, Any] = Depends(require_role("school_admin", "content_creator")),
    service: SchoolService = Depends(get_school_service),
) -> dict[str, Any]:
    school_id = current_user.get("school_id", "")
    tenant_id = current_user.get("tenant_id", "")
    return await service.get_school_dashboard(school_id, tenant_id)


@router.post(
    "/analytics",
    summary="Get school analytics (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def school_analytics(
    body: SchoolAnalyticsRequest,
    current_user: dict[str, Any] = Depends(require_role("school_admin", "content_creator")),
    service: SchoolService = Depends(get_school_service),
) -> AnalyticsResponse:
    start = datetime.fromisoformat(body.startDate)
    end = datetime.fromisoformat(body.endDate)
    school_id = current_user.get("school_id", "")

    data = await service.get_school_analytics(school_id, start.isoformat(), end.isoformat())
    return AnalyticsResponse(
        startDate=body.startDate, endDate=body.endDate, count=len(data), data=data
    )


@router.get(
    "/{school_id}",
    summary="Get school by ID (tenant only)",
    status_code=status.HTTP_200_OK,
)
async def get_school(
    school_id: str,
    current_user: dict[str, Any] = Depends(require_tenant),
    service: SchoolService = Depends(get_school_service),
) -> SchoolResponse:
    school = await service.get_school(school_id, current_user["sub"])
    return SchoolResponse.from_domain(school)


@router.patch(
    "/{school_id}",
    summary="Update a school (tenant only)",
    status_code=status.HTTP_200_OK,
)
async def update_school(
    school_id: str,
    body: SchoolUpdateRequest,
    current_user: dict[str, Any] = Depends(require_tenant),
    service: SchoolService = Depends(get_school_service),
) -> SchoolResponse:
    tenant_id: str = current_user["sub"]
    school = await service.update_school(school_id, body, tenant_id)
    return SchoolResponse.from_domain(school)


@router.delete(
    "/{school_id}",
    summary="Delete a school (tenant only)",
    status_code=status.HTTP_200_OK,
)
async def delete_school(
    school_id: str,
    current_user: dict[str, Any] = Depends(require_tenant),
    service: SchoolService = Depends(get_school_service),
) -> MessageResponse:
    await service.delete_school(school_id, current_user["sub"])
    return MessageResponse(message="School deleted successfully")
