"""Request schemas and create DTOs for content/quiz endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ContentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    language: str
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    audio_content: list[Any] | None = None
    description: str | None = None
    is_pull_model: bool | None = None
    is_teacher_app: bool | None = None


class ContentUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(..., alias="_id")
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    description: str | None = None
    type: str | None = None
    language: str | None = None
    audio_content: list[Any] | None = None
    is_pull_model: bool | None = None
    is_teacher_app: bool | None = None


class QuizCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    language: str
    title: str | None = None
    theme: str | None = None
    audio_content: list[Any] | None = None
    description: str | None = None
    is_pull_model: bool | None = None
    is_teacher_app: bool | None = None
    local_title: str | None = None
    local_theme: str | None = None
    positive_marks: float | None = None
    negative_marks: float | None = None
    questions: list[Any] | None = None
    options: list[Any] | None = None
    correct_answers: list[Any] | None = None


class ContentCreate(BaseModel):
    """Snake_case DB document DTO for content creation — model_dump() writes correct DB keys
    matching the Content domain model (app/models/content.py)."""

    tenant_id: str
    type: str
    language: str
    created_by: str = ""
    school_id: str | None = None
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    audio_content: list[Any] = Field(default_factory=list)
    description: str = ""
    is_pull_model: bool = False
    is_teacher_app: bool = False
    is_deleted: bool = False
    is_processed: bool = False
    creation_time: int = -1
    version: str = "v3"


class QuizCreate(BaseModel):
    """Snake_case DB document DTO for quiz creation — model_dump() writes correct DB keys
    matching the Quiz domain model."""

    tenant_id: str
    type: str
    language: str
    created_by: str = ""
    school_id: str | None = None
    title: str = ""
    local_title: str = ""
    theme: str = ""
    local_theme: str = ""
    positive_marks: float = 1.0
    negative_marks: float = 0.0
    questions: list[Any] = Field(default_factory=list)
    options: list[Any] = Field(default_factory=list)
    correct_answers: list[Any] = Field(default_factory=list)
    is_deleted: bool = False
    creation_time: int = -1
