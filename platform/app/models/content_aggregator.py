from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import PyObjectId


class WebhookEventType(StrEnum):
    JOB_COMPLETED = "job.completed"
    JOB_FAILED = "job.failed"


class IntegrationClientStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class DeliveryStatus(StrEnum):
    PENDING = "pending"
    CLAIMED = "claimed"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"
    DEAD_LETTERED = "dead_lettered"


class JobEventData(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(alias="jobId")
    content_id: str = Field(alias="contentId")
    job_name: str = Field(alias="jobName")
    completed_at: datetime | None = Field(None, alias="completedAt")
    failed_at: datetime | None = Field(None, alias="failedAt")
    error: str | None = None


class WebhookEventEnvelope(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event: WebhookEventType
    webhook_id: str = Field(alias="webhookId")
    tenant_id: str = Field(alias="tenantId")
    timestamp: datetime
    data: JobEventData


class Webhook(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    client_id: str
    url: str
    secret_encrypted: str = Field(repr=False)
    events: list[WebhookEventType]
    status: IntegrationClientStatus
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict) -> Webhook:
        return cls.model_validate(doc)


class DeliveryAttempt(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    webhook_id: PyObjectId
    content_id: str
    event: WebhookEventType
    tenant_id: str
    client_id: str
    payload_data: JobEventData
    attempt_number: int
    status: DeliveryStatus

    @classmethod
    def from_mongo(cls, doc: dict) -> DeliveryAttempt:
        return cls.model_validate(doc)


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
