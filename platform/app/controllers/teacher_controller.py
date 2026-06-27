"""Teacher CRUD routes — /teacher/teachers, /teacher/{id}."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.models.requests.user_requests import TeacherUpdateRequest
from app.models.responses.login import MessageResponse
from app.models.responses.user import UserPublicResponse
from app.platform.auth.dependencies import require_role
from app.platform.auth.hashing import hash_password
from app.services.user_service import UserService, get_user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/teacher", tags=["Teachers"])


@router.get("/teachers", summary="List teachers in admin's school", status_code=status.HTTP_200_OK)
async def list_teachers_by_school(
    current_user: dict[str, Any] = Depends(require_role("school_admin", "content_creator")),
    service: UserService = Depends(get_user_service),
) -> list[UserPublicResponse]:
    school_id = current_user.get("school_id", "")
    if not school_id:
        return []
    teachers = await service.list_teachers_for_school(school_id, current_user.get("tenant_id", ""))
    result = [UserPublicResponse.from_domain(u) for u in teachers]
    result.sort(key=lambda u: u.name)
    return result


@router.patch(
    "/{teacher_id}", summary="Update a teacher (school_admin only)", status_code=status.HTTP_200_OK
)
async def update_teacher(
    teacher_id: str,
    body: TeacherUpdateRequest,
    current_user: dict[str, Any] = Depends(require_role("school_admin", "content_creator")),
    service: UserService = Depends(get_user_service),
) -> UserPublicResponse:
    if not body.name and not body.phoneNumber and not body.password:
        raise HTTPException(
            status_code=400, detail="At least one field (name, phoneNumber, password) is required"
        )

    caller_school = current_user.get("school_id", "")
    updates: dict[str, Any] = {}
    if body.name:
        updates["name"] = body.name.strip()
    if body.phoneNumber:
        updates["phone"] = body.phoneNumber
    if body.password:
        updates["hashed_password"] = hash_password(body.password)

    updated = await service.update_teacher(teacher_id, updates, caller_school)
    return UserPublicResponse.from_domain(updated)


@router.delete(
    "/{teacher_id}", summary="Delete a teacher (school_admin only)", status_code=status.HTTP_200_OK
)
async def delete_teacher(
    teacher_id: str,
    current_user: dict[str, Any] = Depends(require_role("school_admin", "content_creator")),
    service: UserService = Depends(get_user_service),
) -> MessageResponse:
    caller_school = current_user.get("school_id", "")
    await service.delete_teacher(teacher_id, caller_school)
    return MessageResponse(message="Teacher deleted successfully")
