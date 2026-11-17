from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TypedDict

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class ContentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field("", alias="_id")
    tenant_id: str
    client_id: str
    key: str
    payload_hash: str
    content_id: str = ""
    job_id: str = ""
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def _stringify_object_ids(cls, doc: dict) -> dict:
        return {k: str(v) if isinstance(v, ObjectId) else v for k, v in doc.items()}


class IntegrationClaims(TypedDict):
    tenant_ids: list[str]
    scopes: list[str]
    client_name: str


class PartnerAccess(BaseModel):
    client_id: str
    tenant_ids: list[str]
