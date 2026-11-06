"""Request schemas for auth endpoints."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints


class TeacherLoginRequest(BaseModel):
    phone_number: str
    password: str


class TeacherRegisterRequest(BaseModel):
    phone_number: str
    password: str
    name: str
    role: Literal["teacher", "content_creator"] = "teacher"


class TenantRegisterRequest(BaseModel):
    email: str
    password: str
    tenant_name: str
    name: str = ""


class VolunteerCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8)
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class TenantChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UnifiedLoginRequest(BaseModel):
    """Login body for POST /auth/login — email (tenant/school_admin) or phone (content_creator)."""

    identifier: str
    password: str

    @property
    def is_email(self) -> bool:
        return "@" in self.identifier
