"""
Password hashing utilities.

Uses plain bcrypt to match the legacy backend-server (bcryptjs) hashing scheme,
so migrated password hashes remain valid without rehashing.

SECURITY: plain-text passwords are never logged anywhere in this module.
"""

from __future__ import annotations

import base64
import hashlib
from functools import lru_cache

import bcrypt
from cryptography.fernet import Fernet

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


def hash_refresh_token(token: str) -> str:
    """Hash *token* with SHA-256 for at-rest storage/lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    """Symmetric cipher derived from the app secret key, for at-rest replay-cache encryption."""
    key = hashlib.sha256(get_settings().secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(plain: str) -> str:
    """Encrypt *plain* for short-lived at-rest storage. Reversible."""
    return _get_fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    """Decrypt a value produced by :func:`encrypt_secret`."""
    return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
