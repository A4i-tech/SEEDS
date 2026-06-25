"""School admin auth routes — /school/admin/login, /school/admin/me."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, status

from app.models.requests.auth_requests import SchoolAdminLoginRequest
from app.models.responses.common import LoginResponse, TokenResponse
from app.models.responses.school import SchoolResponse
from app.platform.auth.dependencies import get_current_user
from app.services.auth_service import AuthService, get_auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/school/admin", tags=["Auth"])


@router.post("/login", summary="School admin login", status_code=status.HTTP_200_OK)
async def school_admin_login(
    body: SchoolAdminLoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    """Kept for frontend parity — ContentWebApp Login.js:125 calls this directly."""
    result = await service.school_admin_login(body.email, body.password)
    return LoginResponse(token=result["token"], user=result["user"])


@router.get("/me", summary="Get current school admin profile", status_code=status.HTTP_200_OK)
async def school_admin_me(
    current_user: dict[str, Any] = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> dict[str, Any]:
    return await service.get_school_admin_profile(
        school_id=current_user.get("school_id", ""),
        tenant_id=current_user.get("tenant_id", ""),
    )
