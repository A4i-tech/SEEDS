"""Request schemas for student and teacher CRUD endpoints — snake_case only."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class LoginResponse(BaseModel):
    token: str
    user: dict[str, Any]


class MessageResponse(BaseModel):
    message: str
