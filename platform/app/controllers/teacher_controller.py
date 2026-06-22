"""Teacher CRUD routes — /teacher/teachers, /teacher/{id}."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.platform.auth.dependencies import require_teacher
from app.platform.auth.hashing import hash_password
from app.services.user_service import UserService, get_user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/teacher", tags=["Teachers"])


class TeacherUpdateRequest(BaseModel):
    name: str | None = None
    phone_number: str | None = Field(None, alias="phoneNumber")
    password: str | None = None

    model_config = {"populate_by_name": True}


@router.get("/teachers", summary="List teachers in admin's school", status_code=status.HTTP_200_OK)
async def list_teachers_by_school(
    current_user: dict[str, Any] = Depends(require_teacher),
    service: UserService = Depends(get_user_service),
) -> list[dict]:
    school_id = current_user.get("school_id", "")
    if not school_id:
        return []
    teachers = await service.list_teachers_for_school(school_id, current_user.get("tenant_id", ""))
    result = [
        {"_id": str(u.id), "name": u.name, "phoneNumber": u.phone, "role": u.role.value}
        for u in teachers
    ]
    return sorted(result, key=lambda t: t["name"])


@router.patch("/{teacher_id}", summary="Update a teacher (school_admin only)", status_code=status.HTTP_200_OK)
async def update_teacher(
    teacher_id: str,
    body: TeacherUpdateRequest,
    current_user: dict[str, Any] = Depends(require_teacher),
    service: UserService = Depends(get_user_service),
) -> dict[str, Any]:
    if not body.name and not body.phone_number and not body.password:
        raise HTTPException(status_code=400, detail="At least one field (name, phoneNumber, password) is required")

    caller_school = current_user.get("school_id", "")
    updates: dict[str, Any] = {}
    if body.name:
        updates["name"] = body.name.strip()
    if body.phone_number:
        updates["phone"] = body.phone_number
    if body.password:
        updates["hashed_password"] = hash_password(body.password)

    updated = await service.update_teacher(teacher_id, updates, caller_school)
    safe = updated.model_dump(by_alias=False, exclude_none=True)
    safe.pop("hashed_password", None)
    return safe


@router.delete("/{teacher_id}", summary="Delete a teacher (school_admin only)", status_code=status.HTTP_200_OK)
async def delete_teacher(
    teacher_id: str,
    current_user: dict[str, Any] = Depends(require_teacher),
    service: UserService = Depends(get_user_service),
) -> dict[str, str]:
    caller_school = current_user.get("school_id", "")
    await service.delete_teacher(teacher_id, caller_school)
    return {"message": "Teacher deleted successfully"}
