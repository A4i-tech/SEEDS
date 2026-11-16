from __future__ import annotations

from typing import Annotated, Literal

import pycountry
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, ValidationInfo, field_validator
from typing_extensions import TypedDict

from app.models.content import TextContent
from app.platform.error_handling import AppError

PartnerContentType = Literal["story", "audio"]


def _iso_639_1(language: str) -> str:
    if pycountry.languages.get(alpha_2=language) is None:
        raise ValueError(f"'{language}' is not an ISO 639-1 language code")
    return language


def _mp3_only(audio_url: str) -> str:
    if not audio_url.lower().endswith(".mp3"):
        raise ValueError("Only .mp3 audio files are allowed.")
    return audio_url


Iso639Language = Annotated[str, AfterValidator(_iso_639_1)]
Mp3Url = Annotated[str, AfterValidator(_mp3_only)]


class PartnerAudioContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio_url: Mp3Url
    description: str = ""
    duration_seconds: float = 0


class PartnerContentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: PartnerContentType
    language: Iso639Language
    title: TextContent
    theme: TextContent
    description: str = ""
    audio_content: list[PartnerAudioContent] = Field(default_factory=list)
    is_pull_model: bool = False
    is_teacher_app: bool = False


class PartnerContentUpdate(TypedDict, total=False):
    __pydantic_config__ = ConfigDict(extra="forbid")

    type: PartnerContentType
    language: Iso639Language
    title: TextContent
    theme: TextContent
    description: str
    audio_content: list[PartnerAudioContent]
    is_pull_model: bool
    is_teacher_app: bool


class TenantIdsHeader(BaseModel):
    ids: list[str]

    @field_validator("ids", mode="before")
    @classmethod
    def _split(cls, raw: str) -> list[str]:
        return [t.strip() for t in raw.split(",")]

    @field_validator("ids")
    @classmethod
    def _check(cls, ids: list[str], info: ValidationInfo) -> list[str]:
        ctx = info.context
        if any(t not in set(ctx["allowed"]) for t in ids):
            raise AppError("TENANT_NOT_ALLOWED", "tenant not allowed for this client", 403)
        if ctx["single"] and len(ids) != 1:
            raise AppError("TENANT_NOT_ALLOWED", "exactly one tenant id is required", 403)
        return ids


class PartnerContentListQuery(BaseModel):
    language: str = ""
    theme: str = ""
    exp_name: str = ""
    ids: list[str] = Field(default_factory=list)
    only_teacher_app: bool = False
    limit: int = Field(15, ge=1, le=200)
    cursor: str = ""
