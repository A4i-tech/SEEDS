from __future__ import annotations

from typing import Annotated, Literal

from fastapi import Form
from pydantic import BaseModel, Field


class ContentAggregatorTokenRequest(BaseModel):
    grant_type: Literal["client_credentials"] = "client_credentials"
    client_id: str = Field(min_length=1)
    client_secret: str = Field(min_length=1)
    scope: str

    @classmethod
    def as_form(
        cls,
        grant_type: Annotated[Literal["client_credentials"], Form()] = "client_credentials",
        client_id: Annotated[str, Form(min_length=1)] = ...,
        client_secret: Annotated[str, Form(min_length=1)] = ...,
        scope: Annotated[str, Form()] = "",
    ) -> ContentAggregatorTokenRequest:
        return cls(grant_type=grant_type, client_id=client_id, client_secret=client_secret, scope=scope)


class ContentAggregatorRefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class ContentAggregatorRegisterRequest(BaseModel):
    name: str
    tenant_ids: list[str]
    scopes: list[str]


class ContentAggregatorRegisterResponse(BaseModel):
    client_id: str
    client_secret: str
    tenant_ids: list[str]
    allowed_scopes: list[str]
