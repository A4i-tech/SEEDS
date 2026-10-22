from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field

from app.models.requests.webhook_registration_requests import WebhookEventType, WebhookStatus


class IntegrationClientStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class DeliveryStatus(StrEnum):
    PENDING = "pending"
    CLAIMED = "claimed"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"


class Webhook(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    client_id: str
    url: str
    secret_encrypted: str = Field(repr=False)
    events: list[WebhookEventType]
    status: WebhookStatus
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict) -> Webhook:
        return cls.model_validate({k: str(v) if isinstance(v, ObjectId) else v for k, v in doc.items()})


class DeliveryAttempt(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    webhook_id: str
    content_id: str
    event: WebhookEventType
    tenant_id: str
    client_id: str
    payload_data: dict
    attempt_number: int
    status: DeliveryStatus
    next_attempt_at: datetime | None = None
    claimed_at: datetime | None = None
    attempted_at: datetime | None = None
    response_code: int | None = None
    succeeded: bool | None = None
    error: str | None = None

    @classmethod
    def from_mongo(cls, doc: dict) -> DeliveryAttempt:
        return cls.model_validate({k: str(v) if isinstance(v, ObjectId) else v for k, v in doc.items()})


class IntegrationClient(BaseModel):
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
