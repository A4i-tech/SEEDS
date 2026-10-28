from __future__ import annotations

from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from jose import jwt as jose_jwt

from app.controllers._auth_helpers import logout_bearer_fallback
from app.platform.auth.jwt import (
    LOGOUT_TOKEN_MAX_AGE,
    create_access_token,
    verify_expired_token_for_logout,
)
from app.platform.error_handling import UnauthorizedError
from app.platform.settings import get_settings


@pytest.mark.asyncio
async def test_valid_bearer_token_logs_the_user_out():
    service = AsyncMock()
    token = create_access_token({"sub": "teacher-1", "role": "teacher"})
    await logout_bearer_fallback(token, service)
    service.logout.assert_awaited_once_with("teacher-1")


@pytest.mark.asyncio
async def test_invalid_bearer_token_does_not_crash_or_logout():
    service = AsyncMock()
    await logout_bearer_fallback("not-a-real-token", service)
    service.logout.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_token_is_a_noop():
    service = AsyncMock()
    await logout_bearer_fallback(None, service)
    service.logout.assert_not_awaited()


@pytest.mark.asyncio
async def test_tenant_bearer_token_logs_the_tenant_out():
    service = AsyncMock()
    token = create_access_token({"sub": "tenant-1", "role": "tenant"})
    await logout_bearer_fallback(token, service)
    service.logout.assert_awaited_once_with("tenant-1")


@pytest.mark.asyncio
async def test_expired_bearer_token_still_logs_the_user_out():
    service = AsyncMock()
    token = create_access_token(
        {"sub": "teacher-1", "role": "teacher"}, expires_delta=timedelta(seconds=-1)
    )
    await logout_bearer_fallback(token, service)
    service.logout.assert_awaited_once_with("teacher-1")


@pytest.mark.asyncio
async def test_expired_bearer_token_with_bad_signature_does_not_logout():
    service = AsyncMock()
    token = create_access_token(
        {"sub": "teacher-1", "role": "teacher"}, expires_delta=timedelta(seconds=-1)
    )
    mid = len(token) // 2
    tampered = token[:mid] + ("A" if token[mid] != "A" else "B") + token[mid + 1 :]
    await logout_bearer_fallback(tampered, service)
    service.logout.assert_not_awaited()


@pytest.mark.asyncio
async def test_expired_bearer_token_within_logout_window_still_logs_out():
    service = AsyncMock()
    token = create_access_token(
        {"sub": "teacher-1", "role": "teacher"},
        expires_delta=-(LOGOUT_TOKEN_MAX_AGE - timedelta(seconds=30)),
    )
    await logout_bearer_fallback(token, service)
    service.logout.assert_awaited_once_with("teacher-1")


@pytest.mark.asyncio
async def test_expired_bearer_token_past_logout_window_does_not_logout():
    service = AsyncMock()
    token = create_access_token(
        {"sub": "teacher-1", "role": "teacher"},
        expires_delta=-(LOGOUT_TOKEN_MAX_AGE + timedelta(seconds=30)),
    )
    await logout_bearer_fallback(token, service)
    service.logout.assert_not_awaited()


def test_verify_expired_token_for_logout_rejects_missing_exp():
    settings = get_settings()
    token = jose_jwt.encode(
        {"sub": "teacher-1", "role": "teacher", "iss": "platform"},
        settings.secret_key,
        algorithm="HS256",
    )
    with pytest.raises(UnauthorizedError):
        verify_expired_token_for_logout(token)


def test_verify_expired_token_for_logout_rejects_malformed_exp():
    settings = get_settings()
    token = jose_jwt.encode(
        {
            "sub": "teacher-1",
            "role": "teacher",
            "iss": "platform",
            "exp": "not-a-timestamp",
        },
        settings.secret_key,
        algorithm="HS256",
    )
    with pytest.raises(UnauthorizedError):
        verify_expired_token_for_logout(token)
