"""School domain model - contains school information, users are available in unified users collection"""

from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class School(BaseModel):
    """MongoDB document for a school, maps to the 'schools' collection."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    tenant_id: str = Field(alias="tenantId")
    name: str
    email: str
    hashed_password: str | None = Field(None, alias="password")
    is_active: bool = Field(True, alias="isActive")
    created_at: datetime | None = Field(None, alias="createdAt")
    updated_at: datetime | None = Field(None, alias="updatedAt")

    @classmethod
    def from_mongo(cls, doc: dict) -> School:
        if doc is None:
            return None  # type: ignore[return-value]
        # Coerce any ObjectId field to str — schools collection stores tenantId as ObjectId
        d = {k: str(v) if isinstance(v, ObjectId) else v for k, v in doc.items()}
        return cls.model_validate(d)


