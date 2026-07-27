"""Shared refresh-token route — /auth/token/refresh.

Single endpoint for teacher/tenant/school_admin: role/tenant_id/school_id
travel in the persisted refresh-token claims, so one route serves all three.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.models.requests.auth_requests import RefreshTokenRequest
from app.services.auth_service import AuthService, get_auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/token/refresh", summary="Exchange a refresh token for a new access token")
async def refresh_token(
    body: RefreshTokenRequest,
    service: AuthService = Depends(get_auth_service),
) -> dict:
    return await service.refresh(body.refresh_token)
