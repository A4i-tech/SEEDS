"""
Password hashing utilities.

Uses plain bcrypt to match the legacy backend-server (bcryptjs) hashing scheme,
so migrated password hashes remain valid without rehashing.

SECURITY: plain-text passwords are never logged anywhere in this module.
"""

from __future__ import annotations

import bcrypt

from app.platform.settings import get_settings


def _get_rounds() -> int:
    rounds = get_settings().password_salt_rounds
    if rounds < 4:
        raise ValueError(f"password_salt_rounds must be >= 4, got {rounds}")
    return rounds


def hash_password(plain: str) -> str:
    """Hash *plain* with bcrypt. Returns the hashed string."""
    salt = bcrypt.gensalt(rounds=_get_rounds())
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify *plain* against *hashed* using constant-time comparison."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False
