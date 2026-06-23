"""Request schemas for content/quiz endpoints."""
from __future__ import annotations

from typing import Any

from pydantic import ConfigDict, Field

from app.models.base import BaseDocument


class ContentCreateRequest(BaseDocument):
    model_config = ConfigDict(extra="allow")  # inherits alias_generator + populate_by_name

    type: str
    language: str
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    audio_content: list[Any] | None = None  # alias: audioContent
    description: str | None = None
    is_pull_model: bool | None = None       # alias: isPullModel
    is_teacher_app: bool | None = None      # alias: isTeacherApp


class ContentUpdateRequest(BaseDocument):
    model_config = ConfigDict(extra="allow")

    id: str | None = Field(None, alias="_id")
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    description: str | None = None
    type: str | None = None
    language: str | None = None
    audio_content: list[Any] | None = None  # alias: audioContent
    is_pull_model: bool | None = None       # alias: isPullModel
    is_teacher_app: bool | None = None      # alias: isTeacherApp


class QuizCreateRequest(BaseDocument):
    model_config = ConfigDict(extra="allow")

    type: str
    language: str
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    audio_content: list[Any] | None = None  # alias: audioContent
    description: str | None = None
    is_pull_model: bool | None = None       # alias: isPullModel
    is_teacher_app: bool | None = None      # alias: isTeacherApp
    local_title: str | None = None          # alias: localTitle
    local_theme: str | None = None          # alias: localTheme
    positive_marks: float | None = None     # alias: positiveMarks
    negative_marks: float | None = None     # alias: negativeMarks
    questions: list[Any] | None = None
    options: list[Any] | None = None
    correct_answers: list[Any] | None = None  # alias: correctAnswers
