from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field

from app.models.device_push import DeviceType, PushStatus


class DevicePushRequest(BaseModel):
    content_id: str
    device_id: str = Field(min_length=1)
    device_type: DeviceType


class DevicePushCallback(BaseModel):
    source_id: str = Field(min_length=1)
    status: PushStatus
    synced_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
