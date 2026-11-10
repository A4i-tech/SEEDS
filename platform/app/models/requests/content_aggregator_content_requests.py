from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from app.models.content import AudioContent, TextContent
from app.platform.error_handling import AppError
from app.services.language_registry import SUPPORTED_LANGUAGES

_SUPPORTED_LANGUAGE_CODES = {lang["code"] for lang in SUPPORTED_LANGUAGES}


def _check_language(language: str | None) -> str | None:
    if language is not None and language not in _SUPPORTED_LANGUAGE_CODES:
        raise AppError("UNSUPPORTED_LANGUAGE", f"Unsupported language '{language}'", 400)
    return language


class PartnerContentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    language: str

    _validate_language = field_validator("language")(_check_language)
    title: TextContent | None = None
    theme: TextContent | None = None
    description: str = ""
    audio_content: list[AudioContent] = Field(default_factory=list)
    is_pull_model: bool = False
    is_teacher_app: bool = False
    braille_grade: int | None = None


class PartnerContentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str | None = None
    language: str | None = None

    _validate_language = field_validator("language")(_check_language)
    title: TextContent | None = None
    theme: TextContent | None = None
    description: str | None = None
    audio_content: list[AudioContent] | None = None
    is_pull_model: bool | None = None
    is_teacher_app: bool | None = None
    braille_grade: int | None = None


class TenantIdsHeader(BaseModel):
    ids: list[str]

    @field_validator("ids", mode="before")
    @classmethod
    def _split(cls, raw: object) -> object:
        return [t.strip() for t in raw.split(",") if t.strip()] if isinstance(raw, str) else raw

    @field_validator("ids")
    @classmethod
    def _check(cls, ids: list[str], info: ValidationInfo) -> list[str]:
        ctx = info.context
        if not ids:
            raise AppError("TENANT_NOT_ALLOWED", "x-tenant-ids is required", 403)
        if any(t not in set(ctx["allowed"]) for t in ids):
            raise AppError("TENANT_NOT_ALLOWED", "tenant not allowed for this client", 403)
        if ctx["single"] and len(ids) != 1:
            raise AppError("TENANT_NOT_ALLOWED", "exactly one tenant id is required", 403)
        return ids


class PartnerContentListQuery(BaseModel):
    language: str | None = None
    theme: str | None = None
    exp_name: str | None = None
    ids: list[str] = []
    only_teacher_app: bool = False
    limit: int = Field(15, ge=1, le=200)
    cursor: str | None = None


@dataclass(frozen=True)
class Cursor:
    creation_time: int
    key: str
