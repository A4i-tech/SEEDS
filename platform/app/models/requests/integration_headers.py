from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field, ValidationInfo, field_validator

IdempotencyKey = Annotated[str, Field(min_length=1, max_length=255, pattern=r"\S")]


class TenantIdsHeader(BaseModel):
    ids: list[str]

    @field_validator("ids", mode="before")
    @classmethod
    def _split(cls, raw: str) -> list[str]:
        return [t.strip() for t in raw.split(",")]

    @field_validator("ids")
    @classmethod
    def _check(cls, ids: list[str], info: ValidationInfo) -> list[str]:
        ctx = info.context
        if any(t not in set(ctx["allowed"]) for t in ids):
            raise ValueError("tenant not allowed for this client")
        if ctx["single"] and len(ids) != 1:
            raise ValueError("exactly one tenant id is required")
        return ids
