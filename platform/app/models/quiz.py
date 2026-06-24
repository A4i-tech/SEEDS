"""Quiz domain model (from QuizData.js + IVRv2 quiz_model_classes.py)."""
from __future__ import annotations

import uuid

from bson import ObjectId
from pydantic import Field

from app.models.base import BaseDocument
from app.models.content import TextContent


class QuizOption(BaseDocument):
    """A single answer option within a quiz question."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str = "<NOT CREATED>"
    text: str


class QuizQuestion(BaseDocument):
    """A single quiz question with its options and correct answer."""

    question: QuizOption
    options: list[QuizOption] = Field(default_factory=list)
    correct_option_id: str                  # alias: correctOptionId


class Quiz(BaseDocument):
    """MongoDB document for quiz data, maps to the 'quizData' collection."""

    id: str | None = Field(None, alias="_id")
    tenant_id: str | None = None            # alias: tenantId
    school_id: str | None = None            # alias: schoolId
    created_by: str = ""                    # alias: createdBy
    creation_time: int = -1
    is_pull_model: bool = False             # alias: isPullModel
    is_teacher_app: bool = False            # alias: isTeacherApp
    is_deleted: bool = False               # alias: isDeleted
    language: str
    title: TextContent
    theme: TextContent
    positive_marks: float                   # alias: positiveMarks
    negative_marks: float                   # alias: negativeMarks
    questions: list[QuizQuestion] = Field(default_factory=list)

    @classmethod
    def from_mongo(cls, doc: dict) -> Quiz:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        for key in ("tenantId", "tenant_id", "schoolId", "school_id"):
            if key in d and isinstance(d[key], ObjectId):
                d[key] = str(d[key])
        return cls.model_validate(d)


class QuizCreate(BaseDocument):
    """Payload for creating a new quiz."""

    tenant_id: str
    language: str
    title: TextContent
    theme: TextContent
    positive_marks: float                   # alias: positiveMarks
    negative_marks: float                   # alias: negativeMarks
    questions: list[QuizQuestion] = Field(default_factory=list)
    school_id: str | None = None            # alias: schoolId
    created_by: str = ""                    # alias: createdBy
    is_pull_model: bool = False             # alias: isPullModel
    is_teacher_app: bool = False            # alias: isTeacherApp
    creation_time: int = -1
