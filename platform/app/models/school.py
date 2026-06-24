"""School domain model (from School.js)."""
from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from pydantic import Field

from app.models.base import BaseDocument


class School(BaseDocument):
    """MongoDB document for a school, maps to the 'schools' collection."""

    id: str | None = Field(None, alias="_id")
    tenant_id: str                                          # alias: tenantId
    name: str
    email: str
    hashed_password: str | None = Field(None, alias="password")  # DB field is 'password'
    is_active: bool = True                                  # alias: isActive
    created_at: datetime | None = None                     # alias: createdAt
    updated_at: datetime | None = None                     # alias: updatedAt

    @classmethod
    def from_mongo(cls, doc: dict) -> School:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        for key in ("tenantId", "tenant_id"):
            if key in d and isinstance(d[key], ObjectId):
                d[key] = str(d[key])
        return cls.model_validate(d)


class SchoolCreate(BaseDocument):
    """Payload for creating a new school."""

    tenant_id: str                                          # alias: tenantId
    name: str
    email: str
    hashed_password: str | None = Field(None, alias="password")  # DB field is 'password'
    is_active: bool = True                                  # alias: isActive
