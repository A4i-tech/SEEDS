"""Response DTO for translation documents.

extra="allow" so all document fields (translations map, status, approvedBy,
etc.) pass through unchanged; only _id needs explicit ObjectId coercion.
"""

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
        """Serialize a translation document, annotating each translation with an
        explicit ``lowConfidence`` flag plus a document-level ``lowConfidence``
        (true if any language is below the configurable threshold).

        The flag is derived from the stored heuristic ``qualityScore`` via
        quality_scorer.is_low_confidence, so reviewers/clients get the flag
        directly in the payload instead of re-deriving the threshold themselves
        (ticket #436, AC6).
        """
        # Local imports keep this leaf DTO free of a module-load dependency on
        # settings/services (avoids import ordering surprises at app startup).
        from app.platform.settings import get_settings  # noqa: PLC0415
        from app.services.quality_scorer import is_low_confidence  # noqa: PLC0415

        result = cls.model_validate(doc).model_dump(by_alias=True)
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
