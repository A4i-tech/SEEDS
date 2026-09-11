"""Infers the dominant language of a textbook from extracted text using langdetect."""
from __future__ import annotations

import logging

from langdetect import DetectorFactory, detect_langs

DetectorFactory.seed = 0

logger = logging.getLogger(__name__)

_CODE_TO_NAME: dict[str, str] = {
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

_LANG_MAP = _CODE_TO_NAME

_NATIVE_TO_CODE: dict[str, str] = {
    "বাংলা": "bn",
    "বাঙালি": "bn",
    "বাঙ্গালী": "bn",
    "bangla": "bn",
    "bengali": "bn",
    "bn": "bn",
    "ಕನ್ನಡ": "kn",
    "kannada": "kn",
    "kn": "kn",
    "हिन्दी": "hi",
    "हिंदी": "hi",
    "hindi": "hi",
    "hi": "hi",
    "தமிழ்": "ta",
    "tamil": "ta",
    "ta": "ta",
    "తెలుగు": "te",
    "telugu": "te",
    "te": "te",
    "मराठी": "mr",
    "marathi": "mr",
    "mr": "mr",
    "ગુજરાતી": "gu",
    "gujarati": "gu",
    "gu": "gu",
    "മലയാളം": "ml",
    "malayalam": "ml",
    "ml": "ml",
    "ਪੰਜਾਬੀ": "pa",
    "punjabi": "pa",
    "pa": "pa",
    "ଓଡ଼ಿଆ": "or",
    "odia": "or",
    "oriya": "or",
    "or": "or",
    "اردو": "ur",
    "urdu": "ur",
    "ur": "ur",
    "অসমীয়া": "as",
    "assamese": "as",
    "as": "as",
    "english": "en",
    "en": "en",
}

_SCRIPT_RANGES: list[tuple[int, int, str]] = [
    (0x0980, 0x09FF, "bn"),  # Bengali / Assamese
    (0x0C80, 0x0CFF, "kn"),  # Kannada
    (0x0B80, 0x0BFF, "ta"),  # Tamil
    (0x0C00, 0x0C7F, "te"),  # Telugu
    (0x0D00, 0x0D7F, "ml"),  # Malayalam
    (0x0A80, 0x0AFF, "gu"),  # Gujarati
    (0x0A00, 0x0A7F, "pa"),  # Gurmukhi / Punjabi
    (0x0B00, 0x0B7F, "or"),  # Odia
    (0x0900, 0x097F, "hi"),  # Devanagari (Hindi / Marathi)
]


def normalize_language_name(lang: str | None) -> str:
    if not lang:
        return "English"
    cleaned = lang.strip().lower()
    if cleaned in _NATIVE_TO_CODE:
        code = _NATIVE_TO_CODE[cleaned]
        return _CODE_TO_NAME.get(code, "English")
    for name, code in _NATIVE_TO_CODE.items():
        if name in cleaned:
            return _CODE_TO_NAME.get(code, "English")
    for char in lang:
        cp = ord(char)
        for start, end, code in _SCRIPT_RANGES:
            if start <= cp <= end:
                return _CODE_TO_NAME.get(code, "English")
    return _CODE_TO_NAME.get(cleaned, lang.capitalize())


def detect_language(text: str, max_chars: int = 10000) -> str:
    """Infers dominant language from text content using langdetect library."""
    sample = text[:max_chars].strip()
    if not sample:
        return "English"

    # Fast check on Indic scripts first
    script_counts: dict[str, int] = {}
    for char in sample[:2000]:
        cp = ord(char)
        for start, end, code in _SCRIPT_RANGES:
            if start <= cp <= end:
                script_counts[code] = script_counts.get(code, 0) + 1
                break
    if script_counts:
        dominant_code = max(script_counts.items(), key=lambda x: x[1])[0]
        if script_counts[dominant_code] >= 10:
            return _CODE_TO_NAME.get(dominant_code, "English")

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
