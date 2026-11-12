from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

DeviceType = Literal["hexis", "iris"]
PushStatus = Literal["QUEUED", "DELIVERED", "FAILED"]


class DevicePushRecord(BaseModel):
    source_id: str
    tenant_id: str
    content_id: str
    device_id: str
    device_type: DeviceType
    status: PushStatus
    queued_at: datetime
    synced_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class VembiPushReply(BaseModel):
    source_id: str


class VembiStatusReply(BaseModel):
    source_id: str
    status: PushStatus
    last_synced_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
