from __future__ import annotations

from typing import Any

from app.services.language_registry import SUPPORTED_LANGUAGES, Language


def list_languages() -> list[Language]:
    return SUPPORTED_LANGUAGES


def list_languages_for_site(website: dict[str, Any] | None) -> list[Language]:
    enabled_codes = {
        entry["code"] for entry in (website or {}).get("languages") or [] if entry.get("enabled")
    }
    return [lang for lang in SUPPORTED_LANGUAGES if lang["code"] in enabled_codes]
