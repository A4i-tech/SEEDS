"""Request schemas for auth endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class TeacherLoginRequest(BaseModel):
    phoneNumber: str
    password: str
    schoolId: str | None = None


class TeacherRegisterRequest(BaseModel):
    phoneNumber: str
    password: str
    name: str
    role: str = "teacher"

    model_config = {"populate_by_name": True}


class TenantLoginRequest(BaseModel):
    email: str
    password: str


class TenantRegisterRequest(BaseModel):
    email: str
    password: str
    tenantName: str
    name: str = ""

    model_config = {"populate_by_name": True}


class TenantChangePasswordRequest(BaseModel):
    newPassword: str

    model_config = {"populate_by_name": True}


class SchoolAdminLoginRequest(BaseModel):
    email: str
    password: str
