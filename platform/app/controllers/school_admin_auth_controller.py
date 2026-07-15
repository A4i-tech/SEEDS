"""School admin auth routes — /school/admin/me. Login is at POST /auth/login."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, status

from app.models.responses.user import UserPublicResponse
from app.platform.auth.dependencies import get_current_user
from app.services.auth_service import AuthService, get_auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/school/admin", tags=["Auth"])


@router.get(
    "/me",
    summary="Get current school admin profile",
    status_code=status.HTTP_200_OK,
    response_model_exclude_none=True,
)
async def school_admin_me(
    current_user: dict[str, Any] = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> UserPublicResponse:
    return await service.get_school_admin_profile(
        school_id=current_user.get("school_id", ""),
        tenant_id=current_user.get("tenant_id", ""),
    )
