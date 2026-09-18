from __future__ import annotations

from pydantic import BaseModel, Field


class ContentAggregatorTokenRequest(BaseModel):
    client_id: str = Field(min_length=1)
    client_secret: str = Field(min_length=1)
    scope: str


class ContentAggregatorRegisterRequest(BaseModel):
    name: str
    tenant_ids: list[str]
    scopes: list[str]


class ContentAggregatorRegisterResponse(BaseModel):
    client_id: str
    client_secret: str
    tenant_ids: list[str]
    allowed_scopes: list[str]
