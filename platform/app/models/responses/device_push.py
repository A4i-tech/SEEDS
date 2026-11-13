from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.device_push import DeviceType, PushStatus


class DevicePushResponse(BaseModel):
    source_id: str
    status: PushStatus


class DevicePushDevice(BaseModel):
    device_type: DeviceType
    device_id: str
    status: PushStatus
    queued_at: datetime
    synced_at: datetime


class DevicePushStatusResponse(BaseModel):
    source_id: str
    status: PushStatus
    last_synced_at: datetime
    devices: list[DevicePushDevice]
