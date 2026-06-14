"""
Password hashing utilities.

Uses bcrypt with salt rounds from settings.
SECURITY: plain-text passwords are never logged anywhere in this module.

Note: Uses the `bcrypt` package directly (bcrypt >= 4.0 is incompatible with
passlib's bcrypt backend, so we call bcrypt directly with hmac-sha256 pre-hash
to bypass the 72-byte limit imposed by the underlying C library).
"""

from __future__ import annotations

import hashlib
import hmac

import bcrypt

from app.platform.settings import get_settings


def _get_rounds() -> int:
    """Return the configured salt rounds."""
    return get_settings().password_salt_rounds


def _prehash(plain: str) -> bytes:
    """
    HMAC-SHA256 pre-hash of the plain password to avoid the 72-byte bcrypt
    truncation issue.  The resulting digest is always 32 bytes, well within
    the limit.

    SECURITY: the plain password value is never stored or returned.
    """
    return hashlib.sha256(plain.encode("utf-8")).digest()


def hash_password(plain: str) -> str:
    """
    Hash *plain* with bcrypt.

    Returns the hashed string (UTF-8 decoded bcrypt output).
    The plain password is never retained beyond this call.
    """
    digest = _prehash(plain)
    salt = bcrypt.gensalt(rounds=_get_rounds())
    return bcrypt.hashpw(digest, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify *plain* against *hashed* using constant-time comparison.

    Returns True when they match, False otherwise.
    """
    digest = _prehash(plain)
    return bcrypt.checkpw(digest, hashed.encode("utf-8"))
