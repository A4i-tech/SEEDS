"""
Password hashing utilities.

Uses bcrypt with salt rounds from settings.
SECURITY: plain-text passwords are never logged anywhere in this module.
"""

from __future__ import annotations

import bcrypt

from app.platform.settings import get_settings


def _get_rounds() -> int:
    return get_settings().password_salt_rounds


def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt(rounds=_get_rounds())
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
