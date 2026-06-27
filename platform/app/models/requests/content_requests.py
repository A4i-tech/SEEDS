"""Request schemas and create DTOs for content/quiz endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ContentCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    type: str
    language: str
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    audioContent: list[Any] | None = None
    description: str | None = None
    isPullModel: bool | None = None
    isTeacherApp: bool | None = None


class ContentUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str = Field(..., alias="_id")
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    description: str | None = None
    type: str | None = None
    language: str | None = None
    audioContent: list[Any] | None
    isPullModel: bool | None
    isTeacherApp: bool | None


class QuizCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    type: str
    language: str
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    audioContent: list[Any] | None = None
    description: str | None = None
    isPullModel: bool | None = None
    isTeacherApp: bool | None = None
    localTitle: str | None = None
    localTheme: str | None = None
    positiveMarks: float | None = None
    negativeMarks: float | None = None
    questions: list[Any] | None = None
    options: list[Any] | None = None
    correctAnswers: list[Any] | None = None


class ContentCreate(BaseModel):
    """CamelCase DB document DTO for content creation — model_dump() writes correct DB keys."""

    tenantId: str
    type: str
    language: str
    createdBy: str = ""
    schoolId: str | None = None
    title: dict[str, Any] | None = None
    theme: dict[str, Any] | None = None
    audioContent: list[Any] = Field(default_factory=list)
    description: str = ""
    isPullModel: bool = False
    isTeacherApp: bool = False
    isDeleted: bool = False
    isProcessed: bool = False
    creation_time: int = -1  # DB stores this field as snake_case
    version: str = "v3"


class QuizCreate(BaseModel):
    """CamelCase DB document DTO for quiz creation — model_dump() writes correct DB keys."""

    tenantId: str
    type: str
    language: str
    createdBy: str = ""
    schoolId: str | None = None
    title: str = ""
    localTitle: str = ""
    theme: str = ""
    localTheme: str = ""
    positiveMarks: float = 1.0
    negativeMarks: float = 0.0
    questions: list[Any] = Field(default_factory=list)
    options: list[Any] = Field(default_factory=list)
    correctAnswers: list[Any] = Field(default_factory=list)
    isDeleted: bool = False
    creation_time: int = -1  # DB stores this field as snake_case
