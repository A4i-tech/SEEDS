"""
School controller — school management.

Ported from backend-server/src/routes/schoolRouter.js.

Class routes have been split into class_controller.py.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, status

from app.models.requests.school_requests import (
    SchoolAnalyticsRequest,
    SchoolCreateRequest,
    SchoolUpdateRequest,
    TeacherTransferRequest,
)
from app.platform.auth.dependencies import (
    get_current_user,
    require_teacher,
    require_tenant,
)
from app.platform.auth.hashing import hash_password
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
) -> dict[str, Any]:
    tenant_id: str = current_user.get("sub", "")
    school = await service.create_school(
        name=body.name,
        email=body.email,
        tenant_id=tenant_id,
        plain_password=body.password,
    )
    result = school.model_dump(by_alias=False, exclude_none=True)
    result.pop("hashed_password", None)
    return result


@router.get(
    "",
    summary="List schools for current tenant",
    status_code=status.HTTP_200_OK,
)
async def list_schools(
    current_user: dict[str, Any] = Depends(get_current_user),
    service: SchoolService = Depends(get_school_service),
) -> List[dict]:
    if current_user.get("role") == "tenant":
        tenant_id: str = current_user.get("sub", "")
    else:
        tenant_id = current_user.get("tenant_id", "")

    schools = await service.list_schools_by_tenant(tenant_id)
    result = []
    for s in schools:
        d = s.model_dump(by_alias=False, exclude_none=True)
        d.pop("hashed_password", None)
        result.append(d)
    return result


@router.get(
    "/teachers",
    summary="List teachers in the admin's school (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def school_teachers(
    current_user: dict[str, Any] = Depends(require_teacher),
    service: SchoolService = Depends(get_school_service),
) -> List[dict]:
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
    current_user: dict[str, Any] = Depends(require_teacher),
    service: SchoolService = Depends(get_school_service),
) -> dict[str, Any]:
    teacher = await service.transfer_teacher(body.teacher_id, body.target_school_id)
    return {"message": "Teacher transferred successfully", "teacher": teacher}


@router.get(
    "/dashboard",
    summary="Get school dashboard (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def school_dashboard(
    current_user: dict[str, Any] = Depends(require_teacher),
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
    current_user: dict[str, Any] = Depends(require_teacher),
    service: SchoolService = Depends(get_school_service),
) -> dict[str, Any]:
    start = datetime.fromisoformat(body.start_date)
    end = datetime.fromisoformat(body.end_date)
    school_id = current_user.get("school_id", "")

    data = await service.get_school_analytics(
        school_id, start.isoformat(), end.isoformat()
    )
    return {
        "startDate": body.start_date,
        "endDate": body.end_date,
        "count": len(data),
        "data": data,
    }


@router.get(
    "/{school_id}",
    summary="Get school by ID (tenant only)",
    status_code=status.HTTP_200_OK,
)
async def get_school(
    school_id: str,
    current_user: dict[str, Any] = Depends(require_tenant),
    service: SchoolService = Depends(get_school_service),
) -> dict[str, Any]:
    school = await service.get_school(school_id)
    result = school.model_dump(by_alias=False, exclude_none=True)
    result.pop("hashed_password", None)
    return result


@router.patch(
    "/{school_id}",
    summary="Update a school",
    status_code=status.HTTP_200_OK,
)
async def update_school(
    school_id: str,
    body: SchoolUpdateRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    service: SchoolService = Depends(get_school_service),
) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if body.name:
        updates["name"] = body.name.strip()
    if body.email:
        updates["email"] = body.email.strip()
    if body.password:
        updates["password"] = hash_password(body.password)

    school = await service.update_school(school_id, updates)
    result = school.model_dump(by_alias=False, exclude_none=True)
    result.pop("hashed_password", None)
    return result


@router.delete(
    "/{school_id}",
    summary="Delete a school (tenant only)",
    status_code=status.HTTP_200_OK,
)
async def delete_school(
    school_id: str,
    current_user: dict[str, Any] = Depends(require_tenant),
    service: SchoolService = Depends(get_school_service),
) -> dict[str, Any]:
    tenant_id: str = current_user.get("sub", "")
    await service.delete_school(school_id, tenant_id)
    return {"message": "School deleted successfully"}
