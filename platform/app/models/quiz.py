"""Quiz domain model (from QuizData.js + IVRv2 quiz_model_classes.py)."""
from __future__ import annotations

import uuid

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field

from app.models.content import TextContent


class QuizOption(BaseModel):
    """A single answer option within a quiz question."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str = "<NOT CREATED>"
    text: str

    model_config = ConfigDict(populate_by_name=True)


class QuizQuestion(BaseModel):
    """A single quiz question with its options and correct answer."""

    question: QuizOption
    options: list[QuizOption] = Field(default_factory=list)
    correct_option_id: str

    model_config = ConfigDict(populate_by_name=True)


class Quiz(BaseModel):
    """MongoDB document for quiz data, maps to the 'quizData' collection."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    tenant_id: str | None = None  # ObjectId stored as str; ref Tenant
    school_id: str | None = None
    created_by: str = Field(default="", alias="createdBy")
    creation_time: int = -1
    is_pull_model: bool = Field(default=False, alias="isPullModel")
    is_teacher_app: bool = Field(default=False, alias="isTeacherApp")
    is_deleted: bool = Field(default=False, alias="isDeleted")
    language: str
    title: TextContent
    theme: TextContent
    positive_marks: float = Field(..., alias="positiveMarks")
    negative_marks: float = Field(..., alias="negativeMarks")
    questions: list[QuizQuestion] = Field(default_factory=list)

    @classmethod
    def from_mongo(cls, doc: dict) -> Quiz:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        if "tenant_id" in d and isinstance(d["tenant_id"], ObjectId):
            d["tenant_id"] = str(d["tenant_id"])
        return cls.model_validate(d)


class QuizCreate(BaseModel):
    """Payload for creating a new quiz."""

    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str
    language: str
    title: TextContent
    theme: TextContent
    positive_marks: float = Field(..., alias="positiveMarks")
    negative_marks: float = Field(..., alias="negativeMarks")
    questions: list[QuizQuestion] = Field(default_factory=list)
    school_id: str | None = None
    created_by: str = Field(default="", alias="createdBy")
    is_pull_model: bool = Field(default=False, alias="isPullModel")
    is_teacher_app: bool = Field(default=False, alias="isTeacherApp")
    creation_time: int = -1
