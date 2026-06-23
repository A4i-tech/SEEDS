"""Request schemas for auth endpoints."""
from __future__ import annotations

from app.models.base import BaseDocument


class TeacherLoginRequest(BaseDocument):
    phone_number: str       # alias: phoneNumber
    password: str
    school_id: str | None = None  # alias: schoolId


class TeacherRegisterRequest(BaseDocument):
    phone_number: str       # alias: phoneNumber
    password: str
    name: str
    role: str = "teacher"


class TeacherUpdatePasswordRequest(BaseDocument):
    new_password: str       # alias: newPassword


class TenantLoginRequest(BaseDocument):
    email: str
    password: str


class TenantRegisterRequest(BaseDocument):
    email: str
    password: str
    tenant_name: str        # alias: tenantName
    name: str = ""


class TenantChangePasswordRequest(BaseDocument):
    new_password: str       # alias: newPassword


class SchoolAdminLoginRequest(BaseDocument):
    email: str
    password: str
