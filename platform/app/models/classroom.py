"""Classroom domain model (from Class.js)."""
from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class Classroom(BaseModel):
    """MongoDB document for a classroom, maps to the 'classes' collection."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    school_id: str = Field(..., alias="schoolId")
    name: str
    teacher: str  # teacher user id
    students: list[str] = Field(default_factory=list)   # ObjectId refs stored as str
    leaders: list[str] = Field(default_factory=list)    # ObjectId refs stored as str
    content_ids: list[str] = Field(default_factory=list, alias="contentIds")
    created_at: datetime | None = Field(None, alias="createdAt")
    updated_at: datetime | None = Field(None, alias="updatedAt")

    @classmethod
    def from_mongo(cls, doc: dict) -> Classroom:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        if "schoolId" in d and isinstance(d["schoolId"], ObjectId):
            d["schoolId"] = str(d["schoolId"])
        for list_field in ("students", "leaders"):
            if list_field in d:
                d[list_field] = [str(v) if isinstance(v, ObjectId) else v for v in d[list_field]]
        return cls.model_validate(d)


class ClassroomCreate(BaseModel):
    """Payload for creating a new classroom."""

    model_config = ConfigDict(populate_by_name=True)

    school_id: str = Field(..., alias="schoolId")
    name: str
    teacher: str
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    content_ids: list[str] = Field(default_factory=list, alias="contentIds")
