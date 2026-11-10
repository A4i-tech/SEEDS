from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TypedDict

from pydantic import BaseModel, ConfigDict, Field


class IntegrationClientStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"


class IntegrationClient(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    client_id: str
    client_secret_hash: str
    name: str
    tenant_ids: list[str]
    allowed_scopes: list[str] = Field(default_factory=lambda: ["content:read"])
    source_type: str = ""
    status: IntegrationClientStatus = IntegrationClientStatus.ACTIVE
    created_by: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict) -> IntegrationClient:
        return cls.model_validate(dict(doc))


class IntegrationClaims(TypedDict):
    tenant_ids: list[str]
    scopes: list[str]
    client_name: str
    source: str
