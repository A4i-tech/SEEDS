"""Infers the dominant language or script of a textbook from extracted text."""
from __future__ import annotations

import re

# Unicode ranges for major Indian scripts and others commonly in textbooks
_SCRIPTS: list[tuple[str, re.Pattern[str]]] = [
    ("Hindi", re.compile(r"[\u0900-\u097F]")),       # Devanagari
    ("Tamil", re.compile(r"[\u0B80-\u0BFF]")),       # Tamil
    ("Kannada", re.compile(r"[\u0C80-\u0CFF]")),     # Kannada
    ("Telugu", re.compile(r"[\u0C00-\u0C7F]")),      # Telugu
    ("Bengali", re.compile(r"[\u0980-\u09FF]")),     # Bengali / Assamese
    ("Gujarati", re.compile(r"[\u0A80-\u0AFF]")),    # Gujarati
    ("Malayalam", re.compile(r"[\u0D00-\u0D7F]")),   # Malayalam
    ("Odia", re.compile(r"[\u0B00-\u0B7F]")),        # Odia
    ("Punjabi", re.compile(r"[\u0A00-\u0A7F]")),     # Gurmukhi
    ("Urdu", re.compile(r"[\u0600-\u06FF]")),        # Arabic / Urdu script
]

_LATIN_PATTERN = re.compile(r"[a-zA-Z]")


def detect_language(text: str, max_chars: int = 50000) -> str:
    """Infers dominant language from text content.

    If an Indic or regional script is substantially present (> 30 characters),
    that language is returned because textbooks in regional mediums frequently have
    English publisher metadata, URLs, ISBNs, and numbers.
    Otherwise, if Latin letters predominate, returns 'English'.
    """
    if not text:
        return "English"

    sample = text[:max_chars]

    best_indic_lang = None
    max_indic_count = 0
    for lang, pattern in _SCRIPTS:
        count = len(pattern.findall(sample))
        if count > max_indic_count:
            max_indic_count = count
            best_indic_lang = lang

    if best_indic_lang and max_indic_count >= 30:
        return best_indic_lang

    latin_count = len(_LATIN_PATTERN.findall(sample))
    if latin_count > 0:
        return "English"

    if best_indic_lang and max_indic_count > 0:
        return best_indic_lang

    return "English"
