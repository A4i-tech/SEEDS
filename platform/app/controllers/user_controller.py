"""User routes — /user/participants."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, status

from app.platform.auth.dependencies import require_teacher
from app.services.user_service import UserService, get_user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/user", tags=["Users"])


@router.get(
    "/participants",
    summary="Get all participants (requires auth — SECURITY FIX)",
    status_code=status.HTTP_200_OK,
)
async def get_participants(
    current_user: dict[str, Any] = Depends(require_teacher),
    service: UserService = Depends(get_user_service),
) -> list[Any]:
    """SECURITY FIX: was unprotected in legacy backend-server (userRouter.js)."""
    tenant_id = current_user.get("tenant_id", "")
    school_id = current_user.get("school_id", "")
    if not tenant_id:
        return []
    return await service.get_participants_for_school(tenant_id, school_id)
