from __future__ import annotations

from pydantic import BaseModel


class ContentAggregatorTokenRequest(BaseModel):
    client_id: str
    client_secret: str
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
