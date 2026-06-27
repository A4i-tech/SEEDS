"""Tenant auth routes — /tenant/*."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.requests.auth_requests import (
    TenantChangePasswordRequest,
    TenantLoginRequest,
    TenantRegisterRequest,
)
from app.models.requests.tenant_requests import TenantAnalyticsRequest
from app.models.responses.analytics_response import AnalyticsResponse
from app.models.responses.login import LoginResponse, MessageResponse
from app.models.responses.user import UserPublicResponse
from app.platform.auth.dependencies import get_current_user, require_tenant
from app.repositories.ivr_repository import IVRRepository
from app.services.auth_service import AuthService, TenantCreate, get_auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenant", tags=["Auth"])


@router.get("/names", summary="Get all tenant names (public)", status_code=status.HTTP_200_OK)
async def tenant_names(
    service: AuthService = Depends(get_auth_service),
) -> list[str]:
    return await service.get_tenant_names()


@router.post("/login", summary="Tenant login", status_code=status.HTTP_200_OK)
async def tenant_login(
    body: TenantLoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    result = await service.login(
        email=body.email,
        password=body.password,
        auth_type="native",
    )
    return LoginResponse(token=result["token"], user=result["user"])


@router.post("/register", summary="Register a new tenant", status_code=status.HTTP_201_CREATED)
async def tenant_register(
    body: TenantRegisterRequest,
    service: AuthService = Depends(get_auth_service),
) -> dict[str, Any]:
    data = TenantCreate(
        name=body.name or body.tenantName,
        email=body.email,
        password=body.password,
        tenant_name=body.tenantName,
    )
    user = await service.register_tenant(data)
    return UserPublicResponse.from_domain(user).to_response()


@router.post(
    "/logout",
    summary="Tenant logout",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(get_current_user)],
)
async def tenant_logout() -> MessageResponse:
    return MessageResponse(message="Logout successful")


@router.get("/me", summary="Get current tenant", status_code=status.HTTP_200_OK)
async def tenant_me(
    current_user: dict[str, Any] = Depends(require_tenant),
    service: AuthService = Depends(get_auth_service),
) -> dict[str, Any]:
    user = await service.get_user_profile(current_user.get("sub", ""), "Tenant")
    return UserPublicResponse.from_domain(user).to_response()


@router.post("/analytics", summary="Tenant analytics", status_code=status.HTTP_200_OK)
async def tenant_analytics(
    body: TenantAnalyticsRequest,
    current_user: dict[str, Any] = Depends(require_tenant),
    service: AuthService = Depends(get_auth_service),
) -> AnalyticsResponse:
    start_date = body.startDate
    end_date = body.endDate
    if not start_date or not end_date:
        raise HTTPException(status_code=400, detail="startDate and endDate are required")

    start = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date)
    tenant_id: str = current_user.get("sub", "")

    data = await IVRRepository(service._db).find_logs_by_tenant_date_range(tenant_id, start, end)
    return AnalyticsResponse(
        startDate=body.startDate, endDate=body.endDate, count=len(data), data=data
    )


@router.post("/change-password", summary="Change tenant password", status_code=status.HTTP_200_OK)
async def tenant_change_password(
    body: TenantChangePasswordRequest,
    current_user: dict[str, Any] = Depends(require_tenant),
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    await service.change_password(current_user.get("sub", ""), body.newPassword)
    return MessageResponse(message="Password changed successfully")


@router.get("/dashboard", summary="Tenant dashboard statistics", status_code=status.HTTP_200_OK)
async def tenant_dashboard(
    current_user: dict[str, Any] = Depends(require_tenant),
    service: AuthService = Depends(get_auth_service),
) -> dict[str, Any]:
    return await service.get_tenant_dashboard(current_user.get("sub", ""))
