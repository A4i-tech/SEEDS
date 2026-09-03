from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TranslationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    translations: dict[str, Any] | None = None
    lowConfidence: bool = False

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
                entry["lowConfidence"] = low
                any_low = any_low or low
        instance.lowConfidence = any_low
        return instance


class AuditEntryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(validation_alias="_id")
    siteId: str | None = Field(default=None, validation_alias="site_id")
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
    translationId: str | None = Field(default=None, validation_alias="translation_id")
    version: int | None = None
    translations: dict[str, Any] | None = None
    approvedBy: str | None = Field(default=None, validation_alias="approved_by")
    approvedAt: Any = Field(default=None, validation_alias="approved_at")
    createdAt: Any = Field(default=None, validation_alias="created_at")

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @classmethod
    def from_doc(cls, doc: dict) -> TranslationVersionResponse:
        return cls.model_validate(doc)
