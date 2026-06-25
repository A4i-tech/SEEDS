"""Quiz domain model — maps to the 'quizData' collection (post-migration 003)."""
from __future__ import annotations

import uuid

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field

from app.models.content import TextContent


class QuizOption(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str = "<NOT CREATED>"
    text: str


class QuizQuestion(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    question: QuizOption
    options: list[QuizOption] = Field(default_factory=list)
    correct_option_id: str


class Quiz(BaseModel):
    """MongoDB document for the 'quizData' collection."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    tenant_id: str | None = None
    school_id: str | None = None
    created_by: str = ""
    creation_time: int = -1
    is_pull_model: bool = False
    is_teacher_app: bool = False
    is_deleted: bool = False
    language: str
    title: TextContent
    theme: TextContent
    positive_marks: float
    negative_marks: float
    questions: list[QuizQuestion] = Field(default_factory=list)

    @classmethod
    def from_mongo(cls, doc: dict) -> Quiz:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        for key in ("_id", "tenant_id", "school_id", "created_by"):
            if key in d and isinstance(d[key], ObjectId):
                d[key] = str(d[key])
        return cls.model_validate(d)


class QuizCreate(BaseModel):
    """Payload for creating a new quiz."""

    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str
    language: str
    title: TextContent
    theme: TextContent
    positive_marks: float
    negative_marks: float
    questions: list[QuizQuestion] = Field(default_factory=list)
    school_id: str | None = None
    created_by: str = ""
    is_pull_model: bool = False
    is_teacher_app: bool = False
    creation_time: int = -1
