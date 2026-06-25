"""Student CRUD routes — /student/*."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.requests.user_requests import StudentCreateRequest, StudentUpdateRequest
from app.models.responses.common import MessageResponse
from app.models.responses.user import UserPublicResponse
from app.platform.auth.dependencies import require_teacher
from app.services.user_service import UserService, get_user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/student", tags=["Students"])


@router.post("", summary="Create a student (school_admin only)", status_code=status.HTTP_201_CREATED)
async def create_student(
    body: StudentCreateRequest,
    current_user: dict[str, Any] = Depends(require_teacher),
    service: UserService = Depends(get_user_service),
) -> UserPublicResponse:
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name and phone_number are required")

    school_id = current_user.get("school_id", "")
    tenant_id = current_user.get("tenant_id", "")
    user = await service.create_student(
        name=body.name.strip(),
        phone_number=body.phone_number,
        school_id=school_id,
        tenant_id=tenant_id,
    )
    return UserPublicResponse.from_domain(user)


@router.get("", summary="List students in admin's school", status_code=status.HTTP_200_OK)
async def list_students(
    current_user: dict[str, Any] = Depends(require_teacher),
    service: UserService = Depends(get_user_service),
) -> list[UserPublicResponse]:
    school_id = current_user.get("school_id", "")
    tenant_id = current_user.get("tenant_id", "")
    if not school_id:
        return []
    students = await service.list_students_for_school(school_id, tenant_id)
    result = [UserPublicResponse.from_domain(u) for u in students]
    result.sort(key=lambda u: u.name)
    return result


@router.patch("/{student_id}", summary="Update a student (school_admin only)", status_code=status.HTTP_200_OK)
async def update_student(
    student_id: str,
    body: StudentUpdateRequest,
    current_user: dict[str, Any] = Depends(require_teacher),
    service: UserService = Depends(get_user_service),
) -> UserPublicResponse:
    if not body.name and not body.phone_number:
        raise HTTPException(status_code=400, detail="name or phone_number is required")

    caller_school = current_user.get("school_id", "")
    updates: dict[str, Any] = {}
    if body.name:
        updates["name"] = body.name.strip()
    if body.phone_number:
        updates["phone"] = body.phone_number

    updated = await service.update_student(student_id, updates, caller_school)
    return UserPublicResponse.from_domain(updated)


@router.delete("/{student_id}", summary="Delete a student (school_admin only)", status_code=status.HTTP_200_OK)
async def delete_student(
    student_id: str,
    current_user: dict[str, Any] = Depends(require_teacher),
    service: UserService = Depends(get_user_service),
) -> MessageResponse:
    caller_school = current_user.get("school_id", "")
    await service.delete_student(student_id, caller_school)
    return MessageResponse(message="Student deleted successfully")
