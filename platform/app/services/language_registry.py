from __future__ import annotations

from typing import TypedDict

import pycountry


class Language(TypedDict):
    code: str
    standard: str
    name: str


def _build_supported_languages() -> list[Language]:
    return [
        {"code": lang.alpha_2, "standard": "ISO 639-1", "name": lang.name}
        for lang in pycountry.languages
        if hasattr(lang, "alpha_2")
    ]


SUPPORTED_LANGUAGES: list[Language] = _build_supported_languages()
