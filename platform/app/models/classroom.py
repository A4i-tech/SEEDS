"""Classroom domain model (from Class.js)."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class Classroom(BaseModel):
    """MongoDB document for a classroom, maps to the 'classes' collection."""

    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(None, alias="_id")
    school_id: str  # ObjectId stored as str; ref School
    name: str
    teacher: str  # teacher id (string)
    students: List[str] = Field(default_factory=list)  # ObjectId refs stored as str
    leaders: List[str] = Field(default_factory=list)   # ObjectId refs stored as str
    content_ids: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_mongo(cls, doc: dict) -> "Classroom":
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        if "school_id" in d and isinstance(d["school_id"], ObjectId):
            d["school_id"] = str(d["school_id"])
        for list_field in ("students", "leaders"):
            if list_field in d:
                d[list_field] = [str(v) if isinstance(v, ObjectId) else v for v in d[list_field]]
        return cls.model_validate(d)


class ClassroomCreate(BaseModel):
    """Payload for creating a new classroom."""

    model_config = ConfigDict(populate_by_name=True)

    school_id: str
    name: str
    teacher: str
    students: List[str] = Field(default_factory=list)
    leaders: List[str] = Field(default_factory=list)
    content_ids: List[str] = Field(default_factory=list)
