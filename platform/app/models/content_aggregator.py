from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class IntegrationClientStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class IntegrationClient(BaseModel):
    """Document in the 'integrationClients' collection."""

    model_config = ConfigDict(populate_by_name=True)

    client_id: str
    client_secret_hash: str
    tenant_id: str
    allowed_scopes: list[str] = []
    status: IntegrationClientStatus = IntegrationClientStatus.ACTIVE
    created_at: datetime | None = None

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
    family_id: str
    tenant_id: str
    scopes: list[str] = []
    expires_at: datetime
    revoked: bool = False
    created_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict) -> IntegrationToken:
        return cls.model_validate(dict(doc))
