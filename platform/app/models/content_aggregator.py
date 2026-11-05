from __future__ import annotations

from datetime import datetime
from enum import StrEnum

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
    status: IntegrationClientStatus = IntegrationClientStatus.ACTIVE
    created_by: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict) -> IntegrationClient:
        return cls.model_validate(dict(doc))


class IntegrationTokenType(StrEnum):
    REFRESH = "refresh"


class IntegrationToken(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    token_id: str
    client_id: str
    type: IntegrationTokenType
    tenant_ids: list[str]
    scope: str
    expires_at: datetime
    family_expires_at: datetime
    revoked: bool = False
    revoked_reason: str | None = None
    consumed_at: datetime | None = None
    created_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict) -> IntegrationToken:
        return cls.model_validate(dict(doc))
