"""School domain model — school docs live in the unified users collection (role='school')."""
from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class School(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    tenant_id: str
    name: str
    email: str
    hashed_password: str | None = None
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_mongo(cls, doc: dict) -> School:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        if "tenant_id" in d and isinstance(d["tenant_id"], ObjectId):
            d["tenant_id"] = str(d["tenant_id"])
        return cls.model_validate(d)


class SchoolCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str
    name: str
    email: str
    hashed_password: str | None = None
    is_active: bool = True
