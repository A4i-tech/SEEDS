from __future__ import annotations

from cryptography.fernet import Fernet

from app.platform.error_handling import ConfigurationError
from app.platform.settings import get_settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = get_settings().webhook_secret_encryption_key
        if not key:
            raise ConfigurationError("webhook_secret_encryption_key is not configured")
        try:
            _fernet = Fernet(key.encode("utf-8"))
        except ValueError as exc:
            raise ConfigurationError("webhook_secret_encryption_key is invalid") from exc
    return _fernet


def validate_configured() -> None:
    _get_fernet()


def encrypt_secret(secret: str) -> str:
    return _get_fernet().encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
