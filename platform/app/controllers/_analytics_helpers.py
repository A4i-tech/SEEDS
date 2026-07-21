"""Shared helpers for the analytics routes on school_controller and
tenant_controller.

Kept in one place so the two controllers (which serve the same analytics
service under different role scopes) don't duplicate the scope guard, the
structured error-logging wrapper, or the response envelope.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from app.platform.error_handling import AppError

logger = logging.getLogger(__name__)


def require_school_scope(user: dict[str, Any]) -> str:
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


async def run_analytics(route: str, scope: dict, date_range: dict, awaitable: Any) -> dict:
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


def analytics_envelope(scope: dict, date_range: dict, result: dict) -> dict:
    """Wrap a service result in the shared response envelope."""
    return {
        "startDate": date_range["start"].isoformat(),
        "endDate": date_range["end"].isoformat(),
        "filters": {
            "schoolId": scope.get("schoolId"),
            "teacherId": scope.get("teacherId"),
        },
        **result,
    }


def date_range(start_date: datetime, end_date: datetime) -> dict[str, datetime]:
    """Normalize FastAPI-parsed datetime query params into the service's
    ``{start, end}`` shape. Parsing/validation (incl. 422 on bad input) is
    handled by FastAPI from the ``datetime`` param type, not hand-rolled here."""
    return {"start": start_date, "end": end_date}
