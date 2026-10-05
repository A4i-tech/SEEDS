from __future__ import annotations

import logging
import re

from langdetect import DetectorFactory, LangDetectException, detect_langs

from app.services.language_registry import SUPPORTED_LANGUAGES

DetectorFactory.seed = 0

logger = logging.getLogger(__name__)

_CODE_TO_NAME: dict[str, str] = {lang["code"]: lang["name"] for lang in SUPPORTED_LANGUAGES}
_CODE_TO_NAME.update({"pa": "Punjabi", "or": "Odia"})

_NAME_TO_CODE: dict[str, str] = {lang["name"].lower(): lang["code"] for lang in SUPPORTED_LANGUAGES}

_NATIVE_TO_CODE: dict[str, str] = {
    "বাংলা": "bn",
    "বাঙালি": "bn",
    "বাঙ্গালী": "bn",
    "bangla": "bn",
    "ಕನ್ನಡ": "kn",
    "हिन्दी": "hi",
    "हिंदी": "hi",
    "தமிழ்": "ta",
    "తెలుగు": "te",
    "मराठी": "mr",
    "ગુજરાતી": "gu",
    "മലയാളം": "ml",
    "ਪੰਜਾਬੀ": "pa",
    "punjabi": "pa",
    "ଓଡ଼ಿଆ": "or",
    "odia": "or",
    "oriya": "or",
    "اردو": "ur",
    "অসমীয়া": "as",
}

_SCRIPT_RANGES: list[tuple[int, int, str]] = [
    (0x0980, 0x09FF, "bn"),
    (0x0C80, 0x0CFF, "kn"),
    (0x0B80, 0x0BFF, "ta"),
    (0x0C00, 0x0C7F, "te"),
    (0x0D00, 0x0D7F, "ml"),
    (0x0A80, 0x0AFF, "gu"),
    (0x0A00, 0x0A7F, "pa"),
    (0x0B00, 0x0B7F, "or"),
    (0x0900, 0x097F, "hi"),
]


def normalize_language_name(lang: str | None) -> str:
    if not lang:
        return "English"
    cleaned = lang.strip().lower()
    if cleaned in _NATIVE_TO_CODE:
        code = _NATIVE_TO_CODE[cleaned]
        return _CODE_TO_NAME.get(code, "English")
    if cleaned in _CODE_TO_NAME:
        return _CODE_TO_NAME[cleaned]
    if cleaned in _NAME_TO_CODE:
        return _CODE_TO_NAME[_NAME_TO_CODE[cleaned]]
    for token in re.split(r"[^\w]+", cleaned):
        code = _NATIVE_TO_CODE.get(token)
        if code:
            return _CODE_TO_NAME.get(code, "English")
    for char in lang:
        cp = ord(char)
        for start, end, code in _SCRIPT_RANGES:
            if start <= cp <= end:
                return _CODE_TO_NAME.get(code, "English")
    return lang.capitalize()


def detect_language(text: str, max_chars: int = 10000) -> str | None:
    sample = text[:max_chars].strip()
    if not sample:
        return "English"

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
                if item.lang in _CODE_TO_NAME and item.lang != "en" and item.prob > 0.15:
                    return _CODE_TO_NAME[item.lang]
            primary = langs[0].lang
            return _CODE_TO_NAME.get(primary, primary.capitalize())
    except LangDetectException as exc:
        logger.warning("Language detection failed: %s", exc)
        return None

    return None
