"""Root conftest — ensures a clean settings cache for every test module."""

from __future__ import annotations

import os

import pytest

# Ensure PASSWORD_SALT_ROUNDS is always a valid bcrypt value (4 = minimum, fast for tests)
os.environ.setdefault("PASSWORD_SALT_ROUNDS", "4")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-tests-32chars!!")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")
os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "")
os.environ.setdefault("DB_CONNECTION", "")
os.environ.setdefault("AUTH_TYPE", "jwt")


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Clear the lru_cache on get_settings before each test to prevent cache poisoning."""
    from app.platform.settings import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
