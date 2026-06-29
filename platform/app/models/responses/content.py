"""Response DTOs for content and quiz endpoints.

ContentResponse/QuizResponse wrap raw MongoDB documents with extra="allow" so all
document fields pass through unchanged. _id from MongoDB is remapped to id so the
wire format always uses id, never _id.
"""
from __future__ import annotations

from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class ContentResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalize(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        # Coerce ObjectId values to str
        data = {k: str(v) if isinstance(v, ObjectId) else v for k, v in data.items()}
        # Remap _id → id so output always uses id
        if "_id" in data and "id" not in data:
            data["id"] = data.pop("_id")
        elif "_id" in data:
            data.pop("_id")
        return data

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str | None:
        return str(v) if v is not None else None

    def to_response(self) -> dict:
        return self.model_dump(by_alias=False, exclude_none=True)


