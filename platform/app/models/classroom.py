"""Classroom domain model (from Class.js)."""
from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from pydantic import Field

from app.models.base import BaseDocument


class Classroom(BaseDocument):
    """MongoDB document for a classroom, maps to the 'classes' collection."""

    id: str | None = Field(None, alias="_id")
    school_id: str                                          # alias: schoolId
    name: str
    teacher: str
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    content_ids: list[str] = Field(default_factory=list)   # alias: contentIds
    created_at: datetime | None = None                     # alias: createdAt
    updated_at: datetime | None = None                     # alias: updatedAt

    @classmethod
    def from_mongo(cls, doc: dict) -> Classroom:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        for key in ("schoolId", "school_id"):
            if key in d and isinstance(d[key], ObjectId):
                d[key] = str(d[key])
        for list_field in ("students", "leaders"):
            if list_field in d:
                d[list_field] = [str(v) if isinstance(v, ObjectId) else v for v in d[list_field]]
        return cls.model_validate(d)


class ClassroomCreate(BaseDocument):
    """Payload for creating a new classroom."""

    school_id: str                                          # alias: schoolId
    name: str
    teacher: str
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    content_ids: list[str] = Field(default_factory=list)   # alias: contentIds
