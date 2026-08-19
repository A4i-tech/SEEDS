"""Response DTO for PATCH /ivr."""

from __future__ import annotations

from pydantic import BaseModel


class IVRUpdateResponse(BaseModel):
    status_code: int
    message: str
    fsm_id: str
