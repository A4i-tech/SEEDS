"""Content Aggregator domain models.

Scope note: this only covers the fields #458 (POST /v1/auth/token) needs to
read/write. The full PLAT-1 schema (ContentV3 field extensions, additional
indexes, etc. — see issue #457) is out of scope here and left for that ticket.
"""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class IntegrationClientStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class IntegrationClient(BaseModel):
    """Document in the 'integrationClients' collection.

    Represents a partner client allowed to exchange client_id/client_secret
    for a JWT. Read-only from #458's perspective — client provisioning is
    out of scope here.
    """

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
    """Document in the 'integrationTokens' collection.

    Only refresh tokens are persisted (access tokens are stateless JWTs
    verified via signature/exp, never stored).

    family_id (#459): links a refresh token to every token it was rotated
    from/into. Reuse detection revokes the whole family, not just one token.
    tenant_id/scopes (#459): captured at issue time so a rotated access
    token reissues the client's originally-granted scope, not whatever the
    client is currently allowed (avoids silent privilege escalation on refresh).
    """

    model_config = ConfigDict(populate_by_name=True)

    token_id: str
    client_id: str
    type: IntegrationTokenType
    family_id: str
    tenant_id: str
    scopes: list[str] = []
    expires_at: datetime
    revoked: bool = False
    created_at: datetime | None = None

    @classmethod
    def from_mongo(cls, doc: dict) -> IntegrationToken:
        return cls.model_validate(dict(doc))
