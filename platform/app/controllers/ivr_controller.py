"""IVR management routes — /answer, /start-call.

Ported from IVRv2:
  GET  /answer      — IVRv2 routers/general.py:22  (Vonage answer webhook)
  POST /start-call  — IVRv2 routers/call_management.py:86 (/start_ivr)

/hangup and /transfer were NOT ported — IVRv2 had hangup commented out (ivr.py:86)
and had no /transfer endpoint; neither was proven to work in production.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.services.ivr_service import IVRService, get_ivr_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["IVR"])


class _StartCallRequest(BaseModel):
    phone_number: str
    tenant_id: str | None = None


@router.get("/answer", summary="Vonage answer webhook — returns initial NCCO")
async def ivr_answer() -> Any:
    return [{"action": "talk", "text": "Hello from SEEDS IVR!", "bargeIn": True, "loop": 1}]
