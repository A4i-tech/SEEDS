"""Request schemas for content/quiz endpoints."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class QuizOptionDTO(BaseModel):
    id: str
    text: str


class QuizQuestionTextDTO(BaseModel):
    id: str
    text: str


class QuizQuestionItemDTO(BaseModel):
    question: QuizQuestionTextDTO
    options: list[QuizOptionDTO]
    correct_option_id: str


class ContentCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    type: str
    language: str
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    audio_content: list[Any] | None = None
    description: str | None = None
    is_pull_model: bool | None = None
    is_teacher_app: bool | None = None


class ContentUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    description: str | None = None
    type: str | None = None
    language: str | None = None
    audio_content: list[Any] | None = None
    is_pull_model: bool | None = None
    is_teacher_app: bool | None = None
    questions: list[QuizQuestionItemDTO] | None = None
    positive_marks: float | None = None
    negative_marks: float | None = None


class QuizCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    type: str
    language: str
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    is_pull_model: bool | None = None
    is_teacher_app: bool | None = None
    questions: list[QuizQuestionItemDTO] | None = None
    positive_marks: float | None = None
    negative_marks: float | None = None
