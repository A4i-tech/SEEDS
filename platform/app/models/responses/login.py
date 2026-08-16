"""Request schemas for student and teacher CRUD endpoints — snake_case only."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, PositiveInt


class LoginResponse(BaseModel):
    token: str
    user: dict[str, Any]
    refresh_token: str
    expires_in: PositiveInt


class MessageResponse(BaseModel):
    message: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: PositiveInt
    token_type: Literal["Bearer"] = "Bearer"
    scope: str | None = None
