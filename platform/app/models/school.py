"""School domain model (from School.js)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class School(BaseModel):
    """MongoDB document for a school, maps to the 'schools' collection."""

    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(None, alias="_id")
    tenant_id: str  # ObjectId stored as str; ref Tenant
    name: str
    email: str
    hashed_password: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_mongo(cls, doc: dict) -> "School":
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        if "tenant_id" in d and isinstance(d["tenant_id"], ObjectId):
            d["tenant_id"] = str(d["tenant_id"])
        return cls.model_validate(d)


class SchoolCreate(BaseModel):
    """Payload for creating a new school."""

    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str
    name: str
    email: str
    hashed_password: Optional[str] = None
    is_active: bool = True
