"""Request schemas for auth endpoints."""
from __future__ import annotations

from pydantic import BaseModel


class TeacherLoginRequest(BaseModel):
    phone_number: str
    password: str
    school_id: str | None = None


class TeacherRegisterRequest(BaseModel):
    phone_number: str
    password: str
    name: str
    role: str = "teacher"


class TeacherUpdatePasswordRequest(BaseModel):
    new_password: str


class TenantLoginRequest(BaseModel):
    email: str
    password: str


class TenantRegisterRequest(BaseModel):
    email: str
    password: str
    tenant_name: str
    name: str = ""


class TenantChangePasswordRequest(BaseModel):
    new_password: str


class SchoolAdminLoginRequest(BaseModel):
    email: str
    password: str
