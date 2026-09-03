from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LanguageResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    createdAt: Any = Field(default=None, validation_alias="created_at")
    updatedAt: Any = Field(default=None, validation_alias="updated_at")

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @classmethod
    def from_doc(cls, doc: dict) -> LanguageResponse:
        return cls.model_validate(doc)
