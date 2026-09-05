from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TranslationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    translations: dict[str, Any] | None = None
    low_confidence: bool = False

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @classmethod
    def from_doc(cls, doc: dict) -> TranslationResponse:
        from app.platform.settings import get_settings  # noqa: PLC0415
        from app.services.quality_scorer import is_low_confidence  # noqa: PLC0415

        instance = cls.model_validate(doc)
        threshold = get_settings().low_confidence_threshold

        any_low = False
        if isinstance(instance.translations, dict):
            for entry in instance.translations.values():
                if not isinstance(entry, dict):
                    continue
                low = is_low_confidence(entry.get("quality_score", 1.0), threshold)
                entry["low_confidence"] = low
                any_low = any_low or low
        instance.low_confidence = any_low
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
