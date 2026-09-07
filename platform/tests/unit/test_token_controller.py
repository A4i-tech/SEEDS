from __future__ import annotations

from typing import Any

import pytest
from fastapi import Response

from app.controllers.token_controller import refresh_token
from app.platform.auth.dependencies import REFRESH_COOKIE_NAME
from app.platform.error_handling import UnauthorizedError


class FakeRequest:
    def __init__(self, cookies: dict[str, str]) -> None:
        self.cookies = cookies


class FakeService:
    def __init__(self) -> None:
        self.seen: list[str] = []

    async def refresh(self, token: str) -> dict[str, Any]:
        self.seen.append(token)
        return {
            "access_token": "new-access",
            "refresh_token": "new-refresh",
            "expires_in": 900,
            "token_type": "Bearer",
        }


async def test_refresh_returns_access_token_only() -> None:
    response = Response()
    service = FakeService()

    result = await refresh_token(
        FakeRequest({REFRESH_COOKIE_NAME: "old-refresh"}),  # type: ignore[arg-type]
        response,
        service,  # type: ignore[arg-type]
    )

    assert service.seen == ["old-refresh"]
    assert result.access_token == "new-access"
    assert result.expires_in == 900
    assert result.token_type == "Bearer"
    assert "refresh_token" not in result.model_dump()
    assert "new-refresh" not in result.model_dump_json()


async def test_refresh_sets_rotated_cookie_and_never_bodies_it() -> None:
    response = Response()

    result = await refresh_token(
        FakeRequest({REFRESH_COOKIE_NAME: "old-refresh"}),  # type: ignore[arg-type]
        response,
        FakeService(),  # type: ignore[arg-type]
    )

    cookie_headers = [
        value for key, value in response.raw_headers if key == b"set-cookie"
    ]
    assert any(b"refresh_token=new-refresh" in header for header in cookie_headers)
    assert any(b"HttpOnly" in header for header in cookie_headers)
    assert "new-refresh" not in result.model_dump_json()


async def test_refresh_without_cookie_is_unauthorized() -> None:
    with pytest.raises(UnauthorizedError):
        await refresh_token(
            FakeRequest({}),  # type: ignore[arg-type]
            Response(),
            FakeService(),  # type: ignore[arg-type]
        )
