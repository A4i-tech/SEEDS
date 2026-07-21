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

from app.controllers._analytics_helpers import (
    analytics_envelope,
    date_range,
    run_analytics,
)
from app.models.responses.analytics_response import (
    ConferenceAnalyticsResponse,
    IvrAnalyticsResponse,
)
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
) -> IvrAnalyticsResponse:
    dr = date_range(start_date, end_date)
    scope = {
        # Tenant tokens set tenant_id to the tenant's own id (auth_service),
        # so no sub fallback is needed here.
        "tenantId": current_user.get("tenant_id", ""),
        "schoolId": school_id or None,
        "teacherId": teacher_id or None,
    }
    result = await run_analytics(
        "tenant_ivr_analytics", scope, dr, service.get_ivr_analytics(scope, dr)
    )
    return IvrAnalyticsResponse.model_validate(analytics_envelope(scope, dr, result))


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
) -> ConferenceAnalyticsResponse:
    dr = date_range(start_date, end_date)
    scope = {
        "tenantId": current_user.get("tenant_id", ""),
        "schoolId": school_id or None,
        "teacherId": teacher_id or None,
    }
    result = await run_analytics(
        "tenant_conference_analytics", scope, dr, service.get_conference_analytics(scope, dr)
    )
    return ConferenceAnalyticsResponse.model_validate(analytics_envelope(scope, dr, result))
