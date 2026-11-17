from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, MultiFernet

from app.platform.settings import get_settings


@lru_cache(maxsize=1)
def _get_fernet() -> MultiFernet:
    keys = get_settings().webhook_secret_encryption_key.split(",")
    return MultiFernet([Fernet(key.encode("utf-8")) for key in keys])


def encrypt_secret(secret: str) -> str:
    return _get_fernet().encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")


def reencrypt_secret(token: str) -> str:
    return _get_fernet().rotate(token.encode("utf-8")).decode("utf-8")
