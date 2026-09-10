"""Reversible encryption for content-aggregator webhook secrets.

Outbound HMAC-SHA256 signing (ticket #464) requires the original webhook
secret at delivery time, so it cannot be stored as a one-way bcrypt hash
(unlike passwords). Uses Fernet (symmetric, authenticated) from the
`cryptography` package, an existing dependency — no new package needed.

SECURITY: the plaintext secret is only ever held in memory transiently —
at registration/rotation (before encrypting) and at delivery time
(immediately before computing the HMAC). It must never be logged or
included in API responses except once, at registration/rotation.
"""

from __future__ import annotations

from cryptography.fernet import Fernet

from app.platform.settings import get_settings


def _get_fernet() -> Fernet:
    key = get_settings().webhook_secret_encryption_key
    if not key:
        raise ValueError("webhook_secret_encryption_key is not configured")
    return Fernet(key.encode("utf-8"))


def encrypt_secret(secret: str) -> str:
    """Encrypt *secret*. Returns the Fernet token as a string."""
    return _get_fernet().encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    """Decrypt a Fernet token back into the original secret."""
    return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
