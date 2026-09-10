"""Infers the dominant language of a textbook from extracted text using langdetect."""
from __future__ import annotations

import logging

from langdetect import DetectorFactory, detect_langs

DetectorFactory.seed = 0

logger = logging.getLogger(__name__)

_LANG_MAP: dict[str, str] = {
    "hi": "Hindi",
    "ta": "Tamil",
    "kn": "Kannada",
    "te": "Telugu",
    "bn": "Bengali",
    "gu": "Gujarati",
    "ml": "Malayalam",
    "mr": "Marathi",
    "pa": "Punjabi",
    "ur": "Urdu",
    "or": "Odia",
    "as": "Assamese",
    "en": "English",
}


def detect_language(text: str, max_chars: int = 10000) -> str:
    """Infers dominant language from text content using langdetect library."""
    sample = text[:max_chars].strip()
    if not sample:
        return "English"

    try:
        langs = detect_langs(sample)
        if langs:
            for item in langs:
                if item.lang in _LANG_MAP and item.lang != "en" and item.prob > 0.15:
                    return _LANG_MAP[item.lang]
            primary = langs[0].lang
            return _LANG_MAP.get(primary, primary.capitalize())
    except Exception as exc:
        logger.debug("Language detection fallback: %s", exc)

    return "English"
