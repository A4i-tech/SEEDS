"""Response DTOs for project/website onboarding documents.

extra="allow" so all document fields pass through unchanged; only _id needs
explicit ObjectId coercion.
"""

from __future__ import annotations

from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ProjectResponse(BaseModel):
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

    @classmethod
    def from_doc(cls, doc: dict) -> dict:
        return cls.model_validate(doc).model_dump(by_alias=True)


class WebsiteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str | None = Field(None, alias="_id")
    snippet: str | None = None

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

    @classmethod
    def from_doc(cls, doc: dict, snippet: str | None = None) -> dict:
        model = cls.model_validate(doc)
        model.snippet = snippet
        return model.model_dump(by_alias=True)
