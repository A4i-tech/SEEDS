"""Request schemas for student and teacher CRUD endpoints — snake_case only."""
from __future__ import annotations

from pydantic import BaseModel


class StudentCreateRequest(BaseModel):
    name: str
    phone_number: str


class StudentUpdateRequest(BaseModel):
    name: str | None = None
    phone_number: str | None = None


class TeacherUpdateRequest(BaseModel):
    name: str | None = None
    phone_number: str | None = None
    password: str | None = None
