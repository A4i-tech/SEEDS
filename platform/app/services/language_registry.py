from __future__ import annotations

from typing import TypedDict

import pycountry


class Language(TypedDict):
    code: str
    standard: str
    name: str


_SUPPORTED_CODES = ["kn", "hi", "en", "ta", "te", "mr"]

SUPPORTED_LANGUAGES: list[Language] = [
    {"code": code, "standard": "ISO 639-1", "name": pycountry.languages.get(alpha_2=code).name}
    for code in _SUPPORTED_CODES
]
