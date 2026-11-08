"""
Password hashing utilities.

Uses plain bcrypt to match the legacy backend-server (bcryptjs) hashing scheme,
so migrated password hashes remain valid without rehashing.

SECURITY: plain-text passwords are never logged anywhere in this module.
"""

from __future__ import annotations

import asyncio
import hashlib

import bcrypt

from app.platform.settings import get_settings


def _get_rounds() -> int:
    rounds = get_settings().password_salt_rounds
    if rounds < 4:
        raise ValueError(f"password_salt_rounds must be >= 4, got {rounds}")
    return rounds


def _hash_password_sync(plain: str) -> str:
    """Hash *plain* with bcrypt. Returns the hashed string."""
    salt = bcrypt.gensalt(rounds=_get_rounds())
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def _verify_password_sync(plain: str, hashed: str) -> bool:
    """Verify *plain* against *hashed* using constant-time comparison."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


async def hash_password(plain: str) -> str:
    """Hash *plain* with bcrypt off the event loop. Returns the hashed string."""
    return await asyncio.to_thread(_hash_password_sync, plain)


async def verify_password(plain: str, hashed: str) -> bool:
    """Verify *plain* against *hashed* off the event loop. Never raises."""
    return await asyncio.to_thread(_verify_password_sync, plain, hashed)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

