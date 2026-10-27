"""Shared helpers for auth controllers."""

from __future__ import annotations

from app.platform.auth.jwt import verify_token
from app.platform.error_handling import UnauthorizedError
from app.services.auth_service import AuthService


async def logout_bearer_fallback(token: str | None, service: AuthService) -> None:
    """Best-effort logout when no refresh cookie is present but a Bearer token is."""
    if not token:
        return
    try:
        claims = verify_token(token)
    except UnauthorizedError:
        return
    await service.logout(claims["sub"])
