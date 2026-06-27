"""Shared response models used across multiple controllers."""
from __future__ import annotations

from pydantic import BaseModel


class ConferenceStatusResponse(BaseModel):
    status: str
    id: str


class EventQueuedResponse(BaseModel):
    message: str
