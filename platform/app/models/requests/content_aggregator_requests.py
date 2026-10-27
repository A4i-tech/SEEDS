from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class ContentAggregatorTokenRequest(BaseModel):
    client_id: str = Field(min_length=1)
    client_secret: str = Field(min_length=1)
    scope: str


class ContentAggregatorRefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class ContentAggregatorRegisterRequest(BaseModel):
    name: str = Field(min_length=1)
    tenant_ids: list[str] = Field(min_length=1)
    scopes: list[str] = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be blank")
        return value

    @field_validator("tenant_ids")
    @classmethod
    def _validate_tenant_ids(cls, values: list[str]) -> list[str]:
        if any(not v.strip() for v in values):
            raise ValueError("tenant_ids must not contain blank values")
        return values

    @field_validator("scopes")
    @classmethod
    def _validate_scopes(cls, values: list[str]) -> list[str]:
        if any(not v or v.split() != [v] for v in values):
            raise ValueError("scopes must be non-empty, whitespace-free tokens")
        return values


class ContentAggregatorRegisterResponse(BaseModel):
    client_id: str
    client_secret: str
    tenant_ids: list[str]
    allowed_scopes: list[str]
