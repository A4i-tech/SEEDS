"""Classroom CRUD routes — /class/*."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, status

from app.models.classroom import ClassroomCreate
from app.models.requests.school_requests import ClassroomUpsertRequest
from app.models.responses.classroom import ClassroomResponse
from app.platform.auth.dependencies import require_role
from app.platform.error_handling import ForbiddenError, NotFoundError
from app.services.school_service import SchoolService, get_school_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/class", tags=["Classes"])

# Mirrors classRouter.js: authorizeRole(TEACHER_ROLE, CONTENT_CREATOR_ROLE)
_require_class_access = require_role("teacher", "content_creator")


@router.get("", summary="List classes for the calling teacher", status_code=status.HTTP_200_OK)
async def list_classes(
    current_user: dict[str, Any] = Depends(_require_class_access),
    service: SchoolService = Depends(get_school_service),
) -> list[dict]:
    # Legacy classRouter.js only filters by req.userId — no school_id param
    teacher_id = current_user.get("sub", "")
    classrooms = await service.list_classrooms_by_teacher(teacher_id)
    return [ClassroomResponse.from_domain(c).to_response() for c in classrooms]


@router.get("/{class_id}", summary="Get class by ID", status_code=status.HTTP_200_OK)
async def get_class(
    class_id: str,
    current_user: dict[str, Any] = Depends(_require_class_access),
    service: SchoolService = Depends(get_school_service),
) -> dict[str, Any]:
    classroom = await service.get_classroom(class_id)
    return ClassroomResponse.from_domain(classroom).to_response()


@router.post("", summary="Create or update a class", status_code=status.HTTP_200_OK)
async def upsert_class(
    body: ClassroomUpsertRequest,
    current_user: dict[str, Any] = Depends(_require_class_access),
    service: SchoolService = Depends(get_school_service),
) -> dict[str, Any]:
    teacher_id = current_user.get("sub", "")
    school_id = current_user.get("school_id", "")
    repo = service._class_repo

    if body.id:
        existing = await repo.find_by_id(body.id)
        if existing is None:
            raise NotFoundError("Classroom", body.id)
        if existing.teacher != teacher_id:
            raise ForbiddenError("not classroom owner")
        updates: dict[str, Any] = {}
        if body.name is not None:
            updates["name"] = body.name
        if body.students is not None:
            updates["students"] = body.students
        if body.leaders is not None:
            updates["leaders"] = body.leaders
        if body.content_ids is not None:
            updates["content_ids"] = body.content_ids
        classroom = await repo.update(body.id, updates)
        if classroom is None:
            raise NotFoundError("Classroom", body.id)
    else:
        classroom = await repo.create(
            ClassroomCreate(
                school_id=school_id,
                name=body.name or "",
                teacher=teacher_id,
                students=body.students,
                leaders=body.leaders,
                content_ids=body.content_ids,
            )
        )

    return ClassroomResponse.from_domain(classroom).to_response()


@router.delete("/{class_id}", summary="Delete a class", status_code=status.HTTP_200_OK)
async def delete_class(
    class_id: str,
    current_user: dict[str, Any] = Depends(_require_class_access),
    service: SchoolService = Depends(get_school_service),
) -> dict[str, str]:
    await service.delete_classroom(class_id)
    return {"message": "Class deleted successfully"}
