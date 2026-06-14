"""IVR structure controller — FSM management endpoints.

Ported from IVRv2 routers/ivr_management.py and routers/general.py.

Preserves EXACT URL paths from IVRv2:
  GET  /ivr-structure    — get current IVR structure (tenant auth required)
  GET  /ivr/{ivr_id}     — get FSM by ID (tenant auth required)
  POST /start-ivr        — trigger IVR call start (tenant auth required)

All routes require tenant authentication.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.platform.auth.dependencies import get_current_user, get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["IVR Structure"])


def _require_tenant(user: dict = Depends(get_current_user)) -> dict:
    """Dependency: ensures the caller is authenticated."""
    return user


# ---------------------------------------------------------------------------
# GET /ivr-structure
# ---------------------------------------------------------------------------

@router.get(
    "/ivr-structure",
    summary="Get current IVR FSM structure",
    description="Returns the active IVR FSM definition (states, transitions, menus).",
)
async def get_ivr_structure(
    user: dict[str, Any] = Depends(_require_tenant),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Return the active IVR structure for the authenticated tenant."""
    from app.services import ivr_service  # noqa: PLC0415

    tenant_id = user.get("tenant_id", "") if isinstance(user, dict) else ""
    structure = await ivr_service.get_ivr_structure(tenant_id=tenant_id, db=db)
    return structure


# ---------------------------------------------------------------------------
# GET /ivr/{ivr_id}
# ---------------------------------------------------------------------------

@router.get(
    "/ivr/{ivr_id}",
    summary="Get IVR FSM by ID",
    description="Returns a specific IVR FSM definition by its unique identifier.",
)
async def get_ivr_by_id(
    ivr_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Return a specific FSM document by ID."""
    fsm_col = db["ivrfsms"]
    doc = await fsm_col.find_one({"_id": ivr_id})
    if doc is None:
        # Also check radio FSM collection
        radio_col = db["radioFSMs"]
        doc = await radio_col.find_one({"_id": ivr_id})

    if doc is None:
        raise HTTPException(status_code=404, detail=f"IVR FSM not found: {ivr_id}")

    from app.models.ivr_state import IVRfsmDoc  # noqa: PLC0415

    try:
        fsm_doc = IVRfsmDoc.from_mongo(doc)
        return {
            "id": fsm_doc.id,
            "init_state_id": fsm_doc.init_state_id,
            "states": fsm_doc.states,
            "transitions": fsm_doc.transitions,
            "created_at": fsm_doc.created_at,
        }
    except Exception as exc:
        logger.error("Failed to parse FSM %s: %s", ivr_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to parse FSM: {exc}") from exc


# ---------------------------------------------------------------------------
# POST /start-ivr
# ---------------------------------------------------------------------------

class StartIVRRequest(BaseModel):
    phone_number: str
    tenant_id: str = ""


@router.post(
    "/start-ivr",
    summary="Start an IVR call",
    description="Triggers an outbound IVR call to the specified phone number.",
)
async def start_ivr(
    request: StartIVRRequest,
    user: dict[str, Any] = Depends(_require_tenant),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Start an IVR call for the given phone number.

    Requires tenant authentication. The FSM is loaded from the current active
    configuration.
    """
    from app.services import ivr_service  # noqa: PLC0415

    tenant_id = request.tenant_id or (
        user.get("tenant_id", "") if isinstance(user, dict) else ""
    )
    response = await ivr_service.start_call_flow(
        phone_number=request.phone_number,
        tenant_id=tenant_id,
        db=db,
    )

    status_code = response.get("status_code", 500)
    if status_code >= 400:
        raise HTTPException(
            status_code=status_code,
            detail=response.get("message", "Failed to start IVR"),
        )
    return response
