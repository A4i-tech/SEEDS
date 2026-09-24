from __future__ import annotations

from app.models.responses.language import LanguageListResponse
from app.repositories.language_registry import SUPPORTED_LANGUAGES


def list_languages() -> LanguageListResponse:
    return LanguageListResponse(languages=SUPPORTED_LANGUAGES)
