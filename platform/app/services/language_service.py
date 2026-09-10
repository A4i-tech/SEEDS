from __future__ import annotations

from app.repositories.language_repository import SUPPORTED_LANGUAGES, Language


def list_languages() -> list[Language]:
    return SUPPORTED_LANGUAGES
