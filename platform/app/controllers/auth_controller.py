"""Unified ContentWebApp login — POST /auth/login.

Resolves tenant/school_admin by email or content_creator by phone from a
single {identifier, password} body. teacher-webapp keeps its own separate
POST /teacher/login (phone-only, teacher/content_creator) — untouched.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.models.requests.auth_requests import UnifiedLoginRequest
from app.models.responses.login import LoginResponse
from app.services.auth_service import AuthService, get_auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", summary="ContentWebApp login", status_code=status.HTTP_200_OK)
async def login(
    body: UnifiedLoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    result = await service.login_unified(body.identifier, body.password, body.is_email)
    return LoginResponse(token=result["access_token"], user=result["user"])
