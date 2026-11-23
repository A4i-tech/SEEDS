from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

DeviceType = Literal["hexis", "iris"]
PushStatus = Literal["PROCESSING", "SUCCESS", "FAILED"]


class DevicePushRecord(BaseModel):
    source_id: str
    tenant_id: str
    content_id: str
    device_id: str
    device_type: DeviceType
    status: PushStatus
    queued_at: datetime
    synced_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class VembiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class VembiPushRequest(VembiModel):
    device_id: str
    device_type: DeviceType
    file_url: str
    language: str
    title: str
    folder: str = "seeds"


class VembiPushReply(VembiModel):
    source_id: str


class VembiStatusReply(VembiModel):
    source_id: str
    status: PushStatus
    last_synced_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
