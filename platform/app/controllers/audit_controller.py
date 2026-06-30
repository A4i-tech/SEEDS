"""
Audit controller — /log/* endpoints.

Ported from backend-server/src/routes/logRouter.js.

Preserves ALL original URL paths exactly:
  POST /log           — create log entries (bulk insert)
  GET  /log/{userId}  — get logs by user ID

Purpose: client-originated event logging (teacher/webapp action audit trail).
The legacy logRouter had no auth — platform adds tenant scoping for security.
No current frontend consumer; endpoint is available for when clients migrate.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends

from app.models.audit_log import AuditLog
from app.platform.auth.dependencies import get_current_user
from app.services.audit_service import AuditService, get_audit_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/log", tags=["Audit"])


@router.post("", summary="Create log entries", status_code=200)
async def create_log_entries(
    entries: list[AuditLog],
    user: dict = Depends(get_current_user),
    service: AuditService = Depends(get_audit_service),
) -> None:
    """Insert one or more log entries into the logs collection.

    Mirrors: ``await Log.insertMany(req.body)``
    """
    if not entries:
        return None

    tenant_id: str = user.get("tenant_id", "")
    await service.create_log_entries(entries, tenant_id)

    logger.debug("audit_controller: inserted %d log entries tenant_id=%s", len(entries), tenant_id)
    return None


@router.get("/{user_id}", summary="Get logs by user ID", response_model=list[AuditLog])
async def get_logs_by_user(
    user_id: str,
    user: dict = Depends(get_current_user),
    service: AuditService = Depends(get_audit_service),
) -> list[AuditLog]:
    """Return log entries for the given user, scoped to the authenticated tenant.

    Mirrors: ``await Log.getLogsByUserId(req.params.userId)``

    SECURITY: tenant_id from JWT — callers cannot access other tenants' logs.
    """
    tenant_id: str = user.get("tenant_id", "")
    return await service.find_logs_by_user(user_id, tenant_id)
