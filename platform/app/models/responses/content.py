"""Response DTOs for content and quiz endpoints.

ContentResponse/QuizResponse wrap raw MongoDB documents with extra="allow" so all
document fields pass through unchanged. The only explicit mapping is _id (alias)
and ObjectId coercion via _strip_oids so callers never need to pre-process docs.
"""
from __future__ import annotations

from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ContentResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str | None = Field(None, alias="_id")

    @model_validator(mode="before")
    @classmethod
    def _strip_oids(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {k: str(v) if isinstance(v, ObjectId) else v for k, v in data.items()}
        return data

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str | None:
        return str(v) if v is not None else None

    def to_response(self) -> dict:
        return self.model_dump(by_alias=True, exclude_none=True)


class QuizResponse(ContentResponse):
    pass
