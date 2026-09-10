"""Request schemas and create DTOs for content/quiz endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.responses.content import QuizQuestion, TitleText


class ContentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    language: str
    title: TitleText | None = None
    theme: TitleText | None = None
    audio_content: list[Any] | None = None
    description: str = ""
    is_pull_model: bool = False
    is_teacher_app: bool = False

    @field_validator("type")
    @classmethod
    def _normalize_type(cls, v: str) -> str:
        v = v.lower()
        if v == "quiz":
            raise ValueError("type 'quiz' is not allowed here — use the dedicated quiz creation endpoint.")
        return v


class ContentUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    title: TitleText | None = None
    theme: TitleText | None = None
    description: str = ""
    type: str | None = None
    language: str | None = None
    audio_content: list[Any] | None = None
    is_pull_model: bool = False
    is_teacher_app: bool = False

    @field_validator("type")
    @classmethod
    def _normalize_type(cls, v: str | None) -> str | None:
        return v.lower() if v is not None else v


class QuizCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    language: str
    title: TitleText | None = None
    theme: TitleText | None = None
    description: str = ""
    is_pull_model: bool = False
    is_teacher_app: bool = False
    positive_marks: float | None = None
    negative_marks: float | None = None
    questions: list[QuizQuestion] = Field(default_factory=list)

    @field_validator("type")
    @classmethod
    def _normalize_type(cls, v: str) -> str:
        return v.lower()


class ContentCreate(BaseModel):
    tenant_id: str
    type: str
    language: str
    created_by: str = ""
    school_id: str | None = None
    title: TitleText | None = None
    theme: TitleText | None = None
    audio_content: list[Any] = Field(default_factory=list)
    description: str = ""
    is_pull_model: bool = False
    is_teacher_app: bool = False
    is_deleted: bool = False
    is_processed: bool = False
    creation_time: int = -1
    version: str = "v3"

    @field_validator("type")
    @classmethod
    def _normalize_type(cls, v: str) -> str:
        return v.lower()


class QuizCreate(BaseModel):
    tenant_id: str
    type: str
    language: str
    created_by: str = ""
    school_id: str | None = None
    title: TitleText | None = None
    theme: TitleText | None = None
    is_pull_model: bool = False
    is_teacher_app: bool = False
    positive_marks: float = 1.0
    negative_marks: float = 0.0
    questions: list[QuizQuestion] = Field(default_factory=list)
    is_deleted: bool = False
    creation_time: int = -1

    @field_validator("type")
    @classmethod
    def _normalize_type(cls, v: str) -> str:
        return v.lower()
