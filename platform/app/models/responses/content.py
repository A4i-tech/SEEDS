"""Response DTOs for content and quiz endpoints.

ContentResponse strictly declares every field real story/song/poem content docs
have (verified against contentsV3 directly — see this session's DTO audit).
QuizResponse keeps extra="allow" since quiz editing is deprecated; no value in
strictly typing a dead feature's fields (positive_marks, questions, etc.).

The only explicit id mapping is _id (parsed via validation_alias, always
serialized as plain `id` — snake_case end-to-end), plus ObjectId coercion via
_strip_oids so callers never need to pre-process docs.
"""
from __future__ import annotations

from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TitleText(BaseModel):
    english: str | None = None
    local: str | None = None
    audio_url: str | None = None


class AudioTrack(BaseModel):
    audio_url: str | None = None
    description: str | None = None
    duration_seconds: float | None = None


class SasUrlResponse(BaseModel):
    url: str


class SasTokenResponse(BaseModel):
    sas_token: str


class ContentResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, validation_alias="_id")
    type: str
    language: str
    title: TitleText
    theme: TitleText
    audio_content: list[AudioTrack] = Field(default_factory=list)
    description: str | None = None
    is_pull_model: bool = False
    is_teacher_app: bool = False
    is_deleted: bool = False
    is_processed: bool = False
    created_by: str | None = None
    tenant_id: str | None = None
    school_id: str | None = None
    creation_time: int | None = None
    version: str | None = None
    # Only set on PATCH /content when isAudioUploaded=true (a fresh processing job was queued).
    job_id: str | None = None

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

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)

    @classmethod
    def from_doc(cls, doc: dict) -> ContentResponse:
        return cls.model_validate(doc)


class QuizResponse(ContentResponse):
    """Quiz docs (quizData collection) — extra="allow" since quiz editing is
    deprecated (backend-server/platform "quiz" role owns it now); no value in
    strictly typing positive_marks/questions/options/correct_answers etc."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    title: str | TitleText | None = None
    theme: str | TitleText | None = None

    @classmethod
    def from_doc(cls, doc: dict) -> QuizResponse:
        # quizData docs never store a `type` field — this collection IS the type.
        return cls.model_validate({**doc, "type": "quiz"})


class PaginationInfo(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False
    limit: int


class ContentPageResponse(BaseModel):
    data: list[ContentResponse]
    pagination: PaginationInfo
