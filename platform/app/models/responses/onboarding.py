from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProjectResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    source_language: str | None = None
    created_at: Any = None
    updated_at: Any = None

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @classmethod
    def from_doc(cls, doc: dict) -> ProjectResponse:
        return cls.model_validate(doc)


class WebsiteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    snippet: str | None = None
    site_id: str | None = None
    project_id: str | None = None
    created_at: Any = None
    updated_at: Any = None

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @classmethod
    def from_doc(cls, doc: dict, snippet: str | None = None) -> WebsiteResponse:
        model = cls.model_validate(doc)
        model.snippet = snippet
        return model
