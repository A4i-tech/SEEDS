"""Request schemas for content/quiz endpoints."""
from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ContentCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    type: str
    language: str
    title: Optional[dict[str, Any]] = None
    theme: Optional[dict[str, Any]] = None
    audio_content: Optional[List[Any]] = Field(None, alias="audioContent")
    description: Optional[str] = None
    is_pull_model: Optional[bool] = Field(None, alias="isPullModel")
    is_teacher_app: Optional[bool] = Field(None, alias="isTeacherApp")


class ContentUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(..., alias="_id")
    title: Optional[dict[str, Any]] = None
    theme: Optional[dict[str, Any]] = None
    description: Optional[str] = None
    type: Optional[str] = None
    language: Optional[str] = None
    audio_content: Optional[List[Any]] = Field(None, alias="audioContent")
    is_pull_model: Optional[bool] = Field(None, alias="isPullModel")
    is_teacher_app: Optional[bool] = Field(None, alias="isTeacherApp")


class QuizCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    type: str
    language: str
    title: Optional[dict[str, Any]] = None
    theme: Optional[dict[str, Any]] = None
    audio_content: Optional[List[Any]] = Field(None, alias="audioContent")
    description: Optional[str] = None
    is_pull_model: Optional[bool] = Field(None, alias="isPullModel")
    is_teacher_app: Optional[bool] = Field(None, alias="isTeacherApp")
    local_title: Optional[str] = Field(None, alias="localTitle")
    local_theme: Optional[str] = Field(None, alias="localTheme")
    positive_marks: Optional[float] = Field(None, alias="positiveMarks")
    negative_marks: Optional[float] = Field(None, alias="negativeMarks")
    questions: Optional[List[Any]] = None
    options: Optional[List[Any]] = None
    correct_answers: Optional[List[Any]] = Field(None, alias="correctAnswers")
