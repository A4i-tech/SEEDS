from __future__ import annotations

from app.services.language_registry import SUPPORTED_LANGUAGES, Language


def list_languages() -> list[Language]:
    return SUPPORTED_LANGUAGES
