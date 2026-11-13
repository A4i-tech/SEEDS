from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.platform.settings import get_settings
from app.services.quality_scorer import is_low_confidence

ImportRowReason = Literal[
    "missing_source",
    "duplicate_row",
    "source_mismatch",
    "write_failed",
]


class TranslationEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    quality_score: float = 1.0
    low_confidence: bool = False


class TranslationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    translations: dict[str, TranslationEntry]
    low_confidence: bool = False

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @classmethod
    def from_doc(cls, doc: dict) -> TranslationResponse:
        instance = cls.model_validate(doc)
        threshold = get_settings().low_confidence_threshold

        for entry in instance.translations.values():
            entry.low_confidence = is_low_confidence(entry.quality_score, threshold)
        instance.low_confidence = any(entry.low_confidence for entry in instance.translations.values())
        return instance


class AuditEntryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    site_id: str | None = None
    route: str | None = None
    key: str | None = None
    lang: str | None = None
    action: str | None = None
    actor: str | None = None
    provider: str | None = None
    detail: str | None = None
    at: Any = None

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @classmethod
    def from_doc(cls, doc: dict) -> AuditEntryResponse:
        return cls.model_validate(doc)


class TranslationVersionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    translation_id: str | None = None
    version: int | None = None
    translations: dict[str, Any] | None = None
    approved_by: str | None = None
    approved_at: Any = None
    created_at: Any = None

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @classmethod
    def from_doc(cls, doc: dict) -> TranslationVersionResponse:
        return cls.model_validate(doc)


class ImportRowError(BaseModel):
    row: int
    route: str
    key: str
    reason: ImportRowReason


class TranslationImportResponse(BaseModel):
    updated: int = 0
    created: int = 0
    unchanged: int = 0
    skipped_blank: int = 0
    failed: int = 0
    errors: list[ImportRowError] = Field(default_factory=list)
