from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet

from app.platform.auth.hashing import fernet_from_key
from app.platform.settings import get_settings


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    return fernet_from_key(get_settings().webhook_secret_encryption_key)


def encrypt_secret(secret: str) -> str:
    return _get_fernet().encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
