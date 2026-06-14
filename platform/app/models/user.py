"""Unified user model covering Teacher, Student, and Tenant roles."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class PyObjectId(str):
    """Custom type that validates MongoDB ObjectIds and stores them as str."""

    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v: Any) -> str:
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, str) and (ObjectId.is_valid(v) or v == ""):
            return v
        raise ValueError(f"Invalid ObjectId: {v!r}")

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type: Any, handler: Any):
        from pydantic_core import core_schema

        return core_schema.no_info_plain_validator_function(
            cls._validate,
            serialization=core_schema.to_string_ser_schema(),
        )

    @classmethod
    def _validate(cls, v: Any) -> str:
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, str):
            return v
        raise ValueError(f"Invalid ObjectId value: {v!r}")


class UserRole(str, Enum):
    TEACHER = "teacher"
    STUDENT = "student"
    TENANT = "tenant"
    CONTENT_CREATOR = "content_creator"


class User(BaseModel):
    """Unified user document stored in the 'users' collection.

    Merges fields from Teacher.js, Student.js, Tenant.js, and UserInfo.js.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(None, alias="_id")
    role: UserRole
    # Contact
    email: Optional[str] = None
    phone: Optional[str] = None  # phoneNumber in legacy models
    # Auth
    hashed_password: Optional[str] = None
    firebase_uid: Optional[str] = None  # UserInfo._id is firebase uid
    # Relationships
    tenant_id: Optional[str] = None   # ObjectId stored as str
    school_id: Optional[str] = None   # ObjectId stored as str
    # Profile
    name: str
    tenant_name: Optional[str] = None  # Tenant.tenantName
    organisation: Optional[str] = None  # UserInfo.organisation
    language_preference: Optional[str] = None
    # Encryption fields (UserInfo)
    encrypted_phone_number: Optional[str] = None
    encryption_iv: Optional[str] = None
    encryption_salt: Optional[str] = None
    # Flags
    is_active: bool = True
    # Timestamps
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    legacy_created_at: Optional[int] = Field(None, alias="creation_time")  # epoch ms

    @classmethod
    def from_mongo(cls, doc: dict) -> "User":
        """Convert a raw MongoDB document to a User instance.

        Converts ObjectId values to str so Pydantic validation passes.
        """
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        for key in ("tenant_id", "school_id"):
            if key in d and isinstance(d[key], ObjectId):
                d[key] = str(d[key])
        return cls.model_validate(d)


class UserCreate(BaseModel):
    """Payload for creating a new user."""

    model_config = ConfigDict(populate_by_name=True)

    role: UserRole
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    hashed_password: Optional[str] = None
    firebase_uid: Optional[str] = None
    tenant_id: Optional[str] = None
    school_id: Optional[str] = None
    tenant_name: Optional[str] = None
    organisation: Optional[str] = None
    language_preference: Optional[str] = None
    is_active: bool = True


class UserUpdate(BaseModel):
    """Payload for partial updates to a user."""

    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    hashed_password: Optional[str] = None
    tenant_id: Optional[str] = None
    school_id: Optional[str] = None
    language_preference: Optional[str] = None
    is_active: Optional[bool] = None
    organisation: Optional[str] = None
