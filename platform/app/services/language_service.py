from __future__ import annotations

from app.repositories.supported_language_repository import SUPPORTED_LANGUAGES, LanguageListResponse


def list_languages() -> LanguageListResponse:
    return LanguageListResponse(languages=SUPPORTED_LANGUAGES)
