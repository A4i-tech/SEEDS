"""Request schemas for content/quiz endpoints."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ContentCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    type: str
    language: str
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    audio_content: list[Any] | None = Field(None, alias="audioContent")
    description: str | None = None
    is_pull_model: bool | None = Field(None, alias="isPullModel")
    is_teacher_app: bool | None = Field(None, alias="isTeacherApp")


class ContentUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(..., alias="_id")
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    description: str | None = None
    type: str | None = None
    language: str | None = None
    audio_content: list[Any] | None = Field(None, alias="audioContent")
    is_pull_model: bool | None = Field(None, alias="isPullModel")
    is_teacher_app: bool | None = Field(None, alias="isTeacherApp")


class QuizCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    type: str
    language: str
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    audio_content: list[Any] | None = Field(None, alias="audioContent")
    description: str | None = None
    is_pull_model: bool | None = Field(None, alias="isPullModel")
    is_teacher_app: bool | None = Field(None, alias="isTeacherApp")
    local_title: str | None = Field(None, alias="localTitle")
    local_theme: str | None = Field(None, alias="localTheme")
    positive_marks: float | None = Field(None, alias="positiveMarks")
    negative_marks: float | None = Field(None, alias="negativeMarks")
    questions: list[Any] | None = None
    options: list[Any] | None = None
    correct_answers: list[Any] | None = Field(None, alias="correctAnswers")
