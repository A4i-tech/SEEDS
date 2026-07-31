"""Request schemas for student and teacher CRUD endpoints — snake_case only."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class LoginResponse(BaseModel):
    token: str
    user: dict[str, Any]
    refresh_token: str | None = None
    expires_in: int | None = None


class MessageResponse(BaseModel):
    message: str


class TokenRefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str
