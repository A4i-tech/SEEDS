from __future__ import annotations

from typing import Annotated, Literal
from urllib.parse import urlparse

from bson import ObjectId
from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from typing_extensions import TypedDict

from app.models.content import TextContent
from app.models.responses.content import QuizQuestion
from app.services.language_registry import SUPPORTED_LANGUAGE_CODES

PartnerAudioType = Literal["story", "audio", "song", "poem", "snippet"]


def _supported_language(language: str) -> str:
    if language not in SUPPORTED_LANGUAGE_CODES:
        raise ValueError(f"'{language}' is not a supported language, valid: {sorted(SUPPORTED_LANGUAGE_CODES)}")
    return language


def _valid_cursor(cursor: str) -> str:
    creation_time, _, last_id = cursor.partition("_")
    if cursor and not (creation_time.isdecimal() and ObjectId.is_valid(last_id)):
        raise ValueError("cursor must look like '<creation_time>_<content_id>' as returned by the previous page")
    return cursor


def _https_only(audio_url: str) -> str:
    if urlparse(audio_url).scheme != "https":
        raise ValueError("Audio URLs must use https.")
    return audio_url


def _mp3_only(audio_url: str) -> str:
    if not audio_url.lower().endswith(".mp3"):
        raise ValueError("Only .mp3 audio files are allowed.")
    return audio_url


Iso639Language = Annotated[str, AfterValidator(_supported_language)]
ListCursor = Annotated[str, AfterValidator(_valid_cursor)]
Mp3Url = Annotated[str, AfterValidator(_https_only), AfterValidator(_mp3_only)]


class PartnerAudioContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio_url: Mp3Url
    description: str = ""
    duration_seconds: float = 0


class PartnerAudioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: PartnerAudioType
    language: Iso639Language
    title: TextContent
    theme: TextContent
    description: str = ""
    audio_content: list[PartnerAudioContent] = Field(default_factory=list)
    is_pull_model: bool = False
    is_teacher_app: bool = False


class PartnerQuizCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["quiz"]
    language: Iso639Language
    title: TextContent
    theme: TextContent
    is_pull_model: bool = False
    is_teacher_app: bool = False
    positive_marks: float = 1.0
    negative_marks: float = 0.0
    questions: list[QuizQuestion] = Field(min_length=1)


PartnerContentCreate = Annotated[PartnerAudioCreate | PartnerQuizCreate, Field(discriminator="type")]


class PartnerContentUpdate(TypedDict, total=False):
    __pydantic_config__ = ConfigDict(extra="forbid")

    type: PartnerAudioType
    language: Iso639Language
    title: TextContent
    theme: TextContent
    description: str
    audio_content: list[PartnerAudioContent]
    is_pull_model: bool
    is_teacher_app: bool
    positive_marks: float
    negative_marks: float
    questions: Annotated[list[QuizQuestion], Field(min_length=1)]


class PartnerContentListQuery(BaseModel):
    language: str = ""
    theme: str = ""
    exp_name: str = ""
    ids: list[str] = Field(default_factory=list)
    only_teacher_app: bool = False
    limit: int = Field(15, ge=1, le=200)
    cursor: ListCursor = ""
