"""Request schemas for auth endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field


class TeacherLoginRequest(BaseModel):
    phone_number: str = Field(..., alias="phoneNumber")
    password: str
    school_id: str | None = Field(None, alias="schoolId")

    model_config = {"populate_by_name": True}


class TeacherRegisterRequest(BaseModel):
    phone_number: str = Field(..., alias="phoneNumber")
    password: str
    name: str
    role: str = "teacher"

    model_config = {"populate_by_name": True}


class TeacherUpdatePasswordRequest(BaseModel):
    new_password: str = Field(..., alias="newPassword")

    model_config = {"populate_by_name": True}


class TenantLoginRequest(BaseModel):
    email: str
    password: str


class TenantRegisterRequest(BaseModel):
    email: str
    password: str
    tenant_name: str = Field(..., alias="tenantName")
    name: str = ""

    model_config = {"populate_by_name": True}


class TenantChangePasswordRequest(BaseModel):
    new_password: str = Field(..., alias="newPassword")

    model_config = {"populate_by_name": True}


class SchoolAdminLoginRequest(BaseModel):
    email: str
    password: str
