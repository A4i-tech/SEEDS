"""Request schemas for auth endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class TeacherLoginRequest(BaseModel):
    phone_number: str
    password: str


class TeacherRegisterRequest(BaseModel):
    phone_number: str
    password: str
    name: str
    role: str = "teacher"


class TenantRegisterRequest(BaseModel):
    email: str
    password: str
    tenant_name: str
    name: str = ""


class TenantChangePasswordRequest(BaseModel):
    new_password: str


class UnifiedLoginRequest(BaseModel):
    """Login body for POST /auth/login — email (tenant/school_admin) or phone (content_creator)."""

    identifier: str
    password: str

    @property
    def is_email(self) -> bool:
        return "@" in self.identifier
