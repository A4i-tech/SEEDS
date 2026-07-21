"""
Analytics controller — IVR and conference usage analytics.

Ported from backend-server analytics.controller.js + the /school/analytics and
/tenant/analytics routes in schoolRouter.js / tenantRouter.js.

Exposes four GET endpoints, two per role:
  - school_admin:  /school/analytics/ivr, /school/analytics/conference
  - tenant:        /tenant/analytics/ivr, /tenant/analytics/conference

This controller owns no single prefix (it spans /school and /tenant), so each
route declares its full path — mirroring the single Node controller that served
both router groups.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.platform.auth.dependencies import require_role
from app.platform.error_handling import AppError
from app.services.analytics_service import AnalyticsService, get_analytics_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Analytics"])


def _parse_range(start_date: str | None, end_date: str | None) -> dict[str, datetime]:
    if not start_date or not end_date:
        logger.warning("analytics: date range rejected — startDate/endDate missing")
        raise AppError("BAD_REQUEST", "Both startDate and endDate are required", 400)
    start = _parse_iso(start_date)
    end = _parse_iso(end_date)
    if start is None or end is None:
        logger.warning(
            "analytics: date range rejected — unparsable startDate=%r endDate=%r",
            start_date,
            end_date,
        )
        raise AppError("BAD_REQUEST", "Invalid date format", 400)
    return {"start": start, "end": end}


def _parse_iso(value: str) -> datetime | None:
    text = value.replace("Z", "+00:00") if value.endswith("Z") else value
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _tenant_id_of(user: dict[str, Any]) -> str:
    """Tenant id for a user. Tenant-role tokens carry the tenant id in 'sub'
    (not tenant_id), so fall back to it; all other roles set tenant_id."""
    return user.get("tenant_id") or user.get("sub") or ""


def _require_school_id(user: dict[str, Any]) -> str:
    """School id for a school_admin, or fail loud.

    school_id is only populated on the native-JWT auth path; the Firebase path
    never sets it. Without this guard a school_admin whose token lacks school_id
    would fall through to an unscoped (tenant-wide) query — silently widening
    their access to every school in the tenant. Fail closed instead.
    """
    school_id = user.get("school_id")
    if not school_id:
        logger.warning("analytics: school_admin token missing school_id — denying")
        raise AppError("FORBIDDEN", "school_admin token is missing a school scope", 403)
    return school_id


async def _invoke(route: str, scope: dict, date_range: dict, awaitable: Any) -> dict:
    """Await an analytics service call, logging structured failure context
    (route, scope, date range) at ERROR before re-raising — per the repo's
    error-handling standard. Never swallows the error."""
    try:
        return await awaitable
    except Exception:
        logger.exception(
            "analytics: %s failed tenantId=%s schoolId=%s teacherId=%s range=%s..%s",
            route,
            scope.get("tenantId"),
            scope.get("schoolId"),
            scope.get("teacherId"),
            date_range["start"].isoformat(),
            date_range["end"].isoformat(),
        )
        raise


def _respond(scope: dict, date_range: dict, result: dict) -> dict:
    return {
        "startDate": date_range["start"].isoformat(),
        "endDate": date_range["end"].isoformat(),
        "filters": {
            "schoolId": scope.get("schoolId"),
            "teacherId": scope.get("teacherId"),
        },
        **result,
    }


# ---------------------------------------------------------------------------
# School-admin endpoints — always scoped to the admin's own school
# ---------------------------------------------------------------------------


@router.get("/school/analytics/ivr", summary="IVR analytics for the admin's school (school_admin)")
async def school_ivr_analytics(
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
    teacher_id: str | None = Query(None, alias="teacherId"),
    user: dict[str, Any] = Depends(require_role("school_admin")),
    service: AnalyticsService = Depends(get_analytics_service),
) -> dict:
    date_range = _parse_range(start_date, end_date)
    scope = {
        "tenantId": _tenant_id_of(user),
        "schoolId": _require_school_id(user),
        "teacherId": teacher_id or None,
    }
    result = await _invoke(
        "school_ivr_analytics", scope, date_range, service.get_ivr_analytics(scope, date_range)
    )
    return _respond(scope, date_range, result)


@router.get(
    "/school/analytics/conference",
    summary="Conference analytics for the admin's school (school_admin)",
)
async def school_conference_analytics(
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
    teacher_id: str | None = Query(None, alias="teacherId"),
    user: dict[str, Any] = Depends(require_role("school_admin")),
    service: AnalyticsService = Depends(get_analytics_service),
) -> dict:
    date_range = _parse_range(start_date, end_date)
    scope = {
        "tenantId": _tenant_id_of(user),
        "schoolId": _require_school_id(user),
        "teacherId": teacher_id or None,
    }
    result = await _invoke(
        "school_conference_analytics",
        scope,
        date_range,
        service.get_conference_analytics(scope, date_range),
    )
    return _respond(scope, date_range, result)


# ---------------------------------------------------------------------------
# Tenant endpoints — tenant-wide, optionally narrowed by schoolId / teacherId
# ---------------------------------------------------------------------------


@router.get("/tenant/analytics/ivr", summary="IVR analytics for a date range (tenant)")
async def tenant_ivr_analytics(
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
    school_id: str | None = Query(None, alias="schoolId"),
    teacher_id: str | None = Query(None, alias="teacherId"),
    user: dict[str, Any] = Depends(require_role("tenant")),
    service: AnalyticsService = Depends(get_analytics_service),
) -> dict:
    date_range = _parse_range(start_date, end_date)
    scope = {
        "tenantId": _tenant_id_of(user),
        "schoolId": school_id or None,
        "teacherId": teacher_id or None,
    }
    result = await _invoke(
        "tenant_ivr_analytics", scope, date_range, service.get_ivr_analytics(scope, date_range)
    )
    return _respond(scope, date_range, result)


@router.get(
    "/tenant/analytics/conference", summary="Conference analytics for a date range (tenant)"
)
async def tenant_conference_analytics(
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
    school_id: str | None = Query(None, alias="schoolId"),
    teacher_id: str | None = Query(None, alias="teacherId"),
    user: dict[str, Any] = Depends(require_role("tenant")),
    service: AnalyticsService = Depends(get_analytics_service),
) -> dict:
    date_range = _parse_range(start_date, end_date)
    scope = {
        "tenantId": _tenant_id_of(user),
        "schoolId": school_id or None,
        "teacherId": teacher_id or None,
    }
    result = await _invoke(
        "tenant_conference_analytics",
        scope,
        date_range,
        service.get_conference_analytics(scope, date_range),
    )
    return _respond(scope, date_range, result)
