"""Response DTOs for content and quiz endpoints.

AudioContent and QuizContent are separate, strictly-typed models — one per
contentsV3 vs quizData collection. `type` is the discriminator FastAPI uses to
pick the right variant when serializing a `ContentItem` (Annotated union), so
a QuizContent instance keeps its quiz fields instead of being coerced down to
AudioContent's schema.

The only explicit id mapping is _id (parsed via validation_alias, always
serialized as plain `id` — snake_case end-to-end), plus ObjectId coercion via
_strip_oids so callers never need to pre-process docs.
"""
from __future__ import annotations

from typing import Annotated, Any, Literal

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


class QuizOptionItem(BaseModel):
    id: str
    text: str
    url: str | None = None


class QuizQuestionText(BaseModel):
    id: str
    text: str
    url: str | None = None


class QuizQuestion(BaseModel):
    question: QuizQuestionText
    options: list[QuizOptionItem] = Field(default_factory=list)
    correct_option_id: str


class ContentBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(validation_alias="_id")
    language: str
    title: TitleText = Field(default_factory=TitleText)
    theme: TitleText = Field(default_factory=TitleText)
    is_pull_model: bool = False
    is_teacher_app: bool = False
    is_deleted: bool = False
    created_by: str | None = None
    tenant_id: str | None = None
    school_id: str | None = None
    creation_time: int | None = None

    @model_validator(mode="before")
    @classmethod
    def _strip_oids(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {k: str(v) if isinstance(v, ObjectId) else v for k, v in data.items()}
        return data

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)


class AudioContent(ContentBase):
    type: Literal["story", "song", "poem", "snippet"]
    audio_content: list[AudioTrack] = Field(default_factory=list)
    description: str | None = None
    is_processed: bool = False
    version: str | None = None
    # Only set on PATCH /content when isAudioUploaded=true (a fresh processing job was queued).
    job_id: str | None = None

    @classmethod
    def from_doc(cls, doc: dict) -> AudioContent:
        return cls.model_validate(doc)


class QuizContent(ContentBase):
    type: Literal["quiz"] = "quiz"
    positive_marks: float = 0.0
    negative_marks: float = 0.0
    questions: list[QuizQuestion] = Field(default_factory=list)

    @classmethod
    def from_doc(cls, doc: dict) -> QuizContent:
        # quizData docs never store a `type` field — this collection IS the type.
        return cls.model_validate({**doc, "type": "quiz"})


ContentItem = Annotated[AudioContent | QuizContent, Field(discriminator="type")]


class PaginationInfo(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False
    limit: int


class ContentPageResponse(BaseModel):
    data: list[ContentItem]
    pagination: PaginationInfo


class WebsiteExtractResponse(BaseModel):
    url: str
    title: str
    content: list[str]


class WebsiteTranslationResponse(BaseModel):
    translatedContent: str
    persisted: bool
    itemCount: int | None = None
