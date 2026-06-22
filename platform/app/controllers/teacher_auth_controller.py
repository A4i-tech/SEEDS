"""Teacher auth routes — /teacher/login, /register, /logout, /me."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, status

from app.models.requests.auth_requests import TeacherLoginRequest, TeacherRegisterRequest
from app.platform.auth.dependencies import get_current_user, require_role, require_teacher
from app.services.auth_service import AuthService, TeacherCreate, get_auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/teacher", tags=["Auth"])


@router.post("/login", summary="Teacher login", status_code=status.HTTP_200_OK)
async def teacher_login(
    body: TeacherLoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> dict[str, Any]:
    return await service.login(
        email=body.phone_number,
        password=body.password,
        auth_type="native",
    )


@router.post(
    "/register",
    summary="Register a new teacher (school_admin only)",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_teacher)],
)
async def teacher_register(
    body: TeacherRegisterRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> dict[str, Any]:
    data = TeacherCreate(
        name=body.name.strip(),
        email=body.phone_number,
        password=body.password,
        phone=body.phone_number,
        tenant_id=current_user.get("tenant_id"),
        school_id=current_user.get("school_id"),
    )
    user = await service.register_teacher(data)
    safe = user.model_dump(by_alias=False, exclude_none=True)
    safe.pop("hashed_password", None)
    return safe


@router.post(
    "/logout",
    summary="Teacher logout",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_role("teacher", "content_creator"))],
)
async def teacher_logout() -> dict[str, str]:
    return {"message": "Logout successful"}


@router.get("/me", summary="Get current teacher", status_code=status.HTTP_200_OK)
async def teacher_me(
    current_user: dict[str, Any] = Depends(require_role("teacher", "content_creator")),
    service: AuthService = Depends(get_auth_service),
) -> dict[str, Any]:
    user = await service.get_user_profile(current_user.get("sub", ""), "Teacher")
    safe = user.model_dump(by_alias=False, exclude_none=True)
    safe.pop("hashed_password", None)
    return safe
