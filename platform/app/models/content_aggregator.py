from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class IntegrationClientStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class IntegrationClient(BaseModel):
    """Document in the 'integrationClients' collection."""

    model_config = ConfigDict(populate_by_name=True)

    client_id: str
    client_secret_hash: str
    name: str
    tenant_ids: list[str]
    allowed_scopes: list[str] = Field(default_factory=list)
    status: IntegrationClientStatus = IntegrationClientStatus.ACTIVE
    created_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict) -> IntegrationClient:
        return cls.model_validate(dict(doc))


class IntegrationTokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


class IntegrationToken(BaseModel):
    """Document in the 'integrationTokens' collection."""

    model_config = ConfigDict(populate_by_name=True)

    token_id: str
    client_id: str
    type: IntegrationTokenType
    tenant_ids: list[str]
    scope: str
    expires_at: datetime
    revoked: bool = False
    created_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict) -> IntegrationToken:
        return cls.model_validate(dict(doc))
