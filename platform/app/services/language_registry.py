from __future__ import annotations

from typing import TypedDict


class Language(TypedDict):
    code: str
    standard: str
    name: str


SUPPORTED_LANGUAGES: tuple[Language, ...] = (
    {"code": "kn", "standard": "ISO 639-1", "name": "Kannada"},
    {"code": "hi", "standard": "ISO 639-1", "name": "Hindi"},
    {"code": "en", "standard": "ISO 639-1", "name": "English"},
    {"code": "ta", "standard": "ISO 639-1", "name": "Tamil"},
    {"code": "te", "standard": "ISO 639-1", "name": "Telugu"},
    {"code": "mr", "standard": "ISO 639-1", "name": "Marathi"},
)
