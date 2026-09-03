from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class GlossaryTermResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    source_term: str | None = None
    target_lang: str | None = None
    translated_term: str | None = None

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @classmethod
    def from_doc(cls, doc: dict) -> GlossaryTermResponse:
        return cls.model_validate(doc)


class GlossaryStatusResponse(BaseModel):
    status: str
