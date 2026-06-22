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
from pydantic import BaseModel

from app.platform.auth.dependencies import get_current_user
from app.services.ivr_service import IVRService, get_ivr_service

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
    service: IVRService = Depends(get_ivr_service),
) -> Any:
    """Return the active IVR structure for the authenticated tenant."""
    tenant_id = user.get("tenant_id", "") if isinstance(user, dict) else ""
    return await service.get_ivr_structure(tenant_id=tenant_id)


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
    service: IVRService = Depends(get_ivr_service),
) -> Any:
    """Return a specific FSM document by ID."""
    fsm_doc = await service.get_ivr_fsm_by_id(ivr_id)
    if fsm_doc is None:
        raise HTTPException(status_code=404, detail=f"IVR FSM not found: {ivr_id}")

    try:
        return {
            "id": fsm_doc.id,
            "init_state_id": fsm_doc.init_state_id,
            "states": fsm_doc.states,
            "transitions": fsm_doc.transitions,
            "created_at": fsm_doc.created_at,
        }
    except Exception as exc:
        logger.error("Failed to serialize FSM %s: %s", ivr_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to serialize FSM: {exc}") from exc


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
    service: IVRService = Depends(get_ivr_service),
) -> Any:
    """Start an IVR call for the given phone number."""
    tenant_id = request.tenant_id or (
        user.get("tenant_id", "") if isinstance(user, dict) else ""
    )
    response = await service.start_call_flow(
        phone_number=request.phone_number,
        tenant_id=tenant_id,
    )

    status_code = response.get("status_code", 500)
    if status_code >= 400:
        raise HTTPException(
            status_code=status_code,
            detail=response.get("message", "Failed to start IVR"),
        )
    return response
