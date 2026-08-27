"""Shared helper for the school analytics routes — the scope guard both the IVR
and conference routes on school_controller apply before delegating to the
service."""

from __future__ import annotations

import logging
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
