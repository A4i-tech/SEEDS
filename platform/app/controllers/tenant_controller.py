"""
Tenant controller — tenant-scoped resources.

Currently exposes tenant-wide IVR and conference usage analytics, optionally
narrowed by schoolId / teacherId. Mirrors school_controller.py: one router,
one prefix (/tenant), resource organized rather than feature organized.

Ported from the /tenant/analytics routes in backend-server tenantRouter.js.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, status

from app.platform.auth.dependencies import require_tenant
from app.services.analytics_service import AnalyticsService, get_analytics_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenant", tags=["Tenant"])


@router.get(
    "/analytics/ivr",
    summary="IVR analytics for a date range (tenant)",
    status_code=status.HTTP_200_OK,
)
async def tenant_ivr_analytics(
    start_date: datetime = Query(alias="startDate"),
    end_date: datetime = Query(alias="endDate"),
    school_id: str | None = Query(None, alias="schoolId"),
    teacher_id: str | None = Query(None, alias="teacherId"),
    current_user: dict[str, Any] = Depends(require_tenant),
    service: AnalyticsService = Depends(get_analytics_service),
) -> dict[str, Any]:
    # Tenant tokens set tenant_id to the tenant's own id (auth_service).
    return await service.ivr_analytics_report(
        tenant_id=current_user.get("tenant_id", ""),
        school_id=school_id or None,
        teacher_id=teacher_id or None,
        start=start_date,
        end=end_date,
    )


@router.get(
    "/analytics/conference",
    summary="Conference analytics for a date range (tenant)",
    status_code=status.HTTP_200_OK,
)
async def tenant_conference_analytics(
    start_date: datetime = Query(alias="startDate"),
    end_date: datetime = Query(alias="endDate"),
    school_id: str | None = Query(None, alias="schoolId"),
    teacher_id: str | None = Query(None, alias="teacherId"),
    current_user: dict[str, Any] = Depends(require_tenant),
    service: AnalyticsService = Depends(get_analytics_service),
) -> dict[str, Any]:
    return await service.conference_analytics_report(
        tenant_id=current_user.get("tenant_id", ""),
        school_id=school_id or None,
        teacher_id=teacher_id or None,
        start=start_date,
        end=end_date,
    )
