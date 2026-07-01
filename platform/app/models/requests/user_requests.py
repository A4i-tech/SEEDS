"""Request schemas for student and teacher CRUD endpoints — snake_case only."""

from __future__ import annotations

from pydantic import BaseModel


class StudentCreateRequest(BaseModel):
    name: str
    phoneNumber: str


class StudentUpdateRequest(BaseModel):
    name: str | None = None
    phoneNumber: str | None = None


class TeacherUpdateRequest(BaseModel):
    name: str | None = None
    phoneNumber: str | None = None
    password: str | None = None
