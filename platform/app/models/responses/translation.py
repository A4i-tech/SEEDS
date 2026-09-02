from __future__ import annotations

from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TranslationResponse(BaseModel):
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
        from app.platform.settings import get_settings  # noqa: PLC0415
        from app.services.quality_scorer import is_low_confidence  # noqa: PLC0415

        result = cls.model_validate(doc).model_dump()
        threshold = get_settings().low_confidence_threshold

        any_low = False
        translations = result.get("translations")
        if isinstance(translations, dict):
            for entry in translations.values():
                if not isinstance(entry, dict):
                    continue
                low = is_low_confidence(entry.get("qualityScore"), threshold)
                entry["lowConfidence"] = low
                any_low = any_low or low
        result["lowConfidence"] = any_low
        return result


class AuditEntryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str | None = Field(None, alias="_id")
    siteId: str | None = None
    route: str | None = None
    key: str | None = None
    lang: str | None = None
    action: str | None = None
    actor: str | None = None
    provider: str | None = None
    detail: str | None = None
    at: Any = None

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
        return cls.model_validate(doc).model_dump()


class TranslationVersionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str | None = Field(None, alias="_id")
    translationId: str | None = None
    version: int | None = None
    translations: dict[str, Any] | None = None
    approvedBy: str | None = None
    approvedAt: Any = None
    createdAt: Any = None

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
        return cls.model_validate(doc).model_dump()
