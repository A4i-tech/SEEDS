"""
Audit controller — /log/* endpoints.

Ported from backend-server/src/routes/logRouter.js.

Preserves ALL original URL paths exactly:
  POST /log           — create log entries (bulk insert)
  GET  /log/{userId}  — get logs by user ID

SECURITY:
  - Tenant scoping enforced on all reads.
  - Write operations require authentication.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, List

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.dependencies import (
    get_current_user,
    get_db,
    require_teacher,
    require_tenant,
)
from app.platform.error_handling import NotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Audit"])


# ---------------------------------------------------------------------------
# POST /log  — bulk insert log entries
# ---------------------------------------------------------------------------

@router.post("/log", summary="Create log entries", status_code=200)
async def create_log_entries(
    entries: List[dict],
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> None:
    """Insert one or more log entries into the logs collection.

    Mirrors: ``await Log.insertMany(req.body)``
    """
    if not entries:
        return None

    tenant_id = user.get("tenant_id") or user.get("tenantId", "")
    now = datetime.now(timezone.utc)

    docs = [
        {
            **entry,
            "tenant_id": tenant_id,
            "created_at": now,
        }
        for entry in entries
    ]

    await db["logs"].insert_many(docs)
    logger.debug("audit_controller: inserted %d log entries tenant_id=%s", len(docs), tenant_id)
    return None


# ---------------------------------------------------------------------------
# GET /log/{userId}  — get logs for a user
# ---------------------------------------------------------------------------

@router.get("/log/{user_id}", summary="Get logs by user ID")
async def get_logs_by_user(
    user_id: str,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> List[dict]:
    """Return log entries for the given user, scoped to the authenticated tenant.

    Mirrors: ``await Log.getLogsByUserId(req.params.userId)``

    SECURITY: results are filtered by tenantId from the JWT — callers cannot
    access logs from other tenants by passing an arbitrary userId.
    """
    tenant_id = user.get("tenant_id") or user.get("tenantId", "")

    query: dict = {"user": user_id}
    if tenant_id:
        query["tenant_id"] = tenant_id

    cursor = db["logs"].find(query).sort("_id", -1)
    docs = await cursor.to_list(length=None)

    results = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        results.append(doc)

    return results
