"""
Authorization denial audit log.

log_denial() emits a structured log entry for every authorization failure.
It does NOT raise — callers are responsible for raising ForbiddenError after
calling this function.

Usage:
    from app.platform.authz.audit import log_denial
    from app.platform.error_handling import ForbiddenError

    log_denial(user_id=uid, resource="conference:abc", action="write", reason="not_owner")
    raise ForbiddenError("not conference owner")
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def log_denial(
    user_id: str,
    resource: str,
    action: str,
    reason: str,
) -> None:
    """
    Emit a structured authorization denial log entry.

    Parameters
    ----------
    user_id:  The subject identifier of the caller (JWT 'sub' claim).
    resource: Human-readable resource being accessed (e.g. "conference:abc123").
    action:   The action being attempted (e.g. "read", "write", "delete").
    reason:   Short machine-readable reason code (e.g. "tenant_mismatch", "not_owner").

    This function NEVER raises — it is the caller's responsibility to raise
    ForbiddenError (or any other appropriate exception) after calling this.
    """
    logger.warning(
        "authz_denied",
        extra={
            "event": "authz_denied",
            "user_id": user_id,
            "resource": resource,
            "action": action,
            "reason": reason,
        },
    )
