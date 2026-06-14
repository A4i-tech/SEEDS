"""
FSM utility functions shared across the IVR FSM engine.

Ported from IVRv2/app/utils/ — contains only the subset used by FSM internals.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Dict, Optional

# IST is UTC+5:30
_IST = timezone(timedelta(hours=5, minutes=30))


def get_ist_date_string() -> str:
    """Get current date in IST as YYYY-MM-DD string."""
    return datetime.now(_IST).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Language utilities
# ---------------------------------------------------------------------------

_LANGUAGE_MAPPING: Dict[str, str] = {
    "kannada": "kn-IN",
    "english": "en-US",
    "hindi": "hi-IN",
    "bengali": "bn-IN",
    "tamil": "ta-IN",
    "marathi": "mr-IN",
}


def get_vonage_language_code(language: str) -> str:
    """Map an internal language name to a Vonage TTS language code.

    Falls back to "en-US" for unknown languages.
    """
    return _LANGUAGE_MAPPING.get(language.lower(), "en-US")


# ---------------------------------------------------------------------------
# Daily limit announcements
# ---------------------------------------------------------------------------

_DAILY_LIMIT_TEMPLATES: Dict[str, str] = {
    "kannada": (
        "ನೀವು ಇಂದಿನ ದೈನಂದಿನ ಆಲಿಸುವ ಮಿತಿಯನ್ನು ತಲುಪಿದ್ದೀರಿ. "
        "ದಯವಿಟ್ಟು ನಾಳೆ ಮತ್ತೆ ಕರೆ ಮಾಡಿ."
    ),
    "english": "You have reached your daily listening limit. Please call back tomorrow.",
    "hindi": "आपने अपनी दैनिक सुनने की सीमा पूरी कर ली है। कृपया कल फिर से कॉल करें।",
    "bengali": "আপনি আজকের শোনার সীমায় পৌঁছে গেছেন। দয়া করে আগামীকাল আবার কল করুন।",
    "tamil": "நீங்கள் இன்றைய கேட்கும் வரம்பை எட்டிவிட்டீர்கள். தயவுசெய்து நாளை மீண்டும் அழைக்கவும்.",
    "marathi": "तुम्ही आजची ऐकण्याची मर्यादा गाठली आहे. कृपया उद्या पुन्हा कॉल करा.",
}

_DEFAULT_DAILY_LIMIT_LANG = "kannada"


def get_daily_limit_announcement(language: str) -> str:
    """Return the daily-limit-reached announcement for *language*."""
    return _DAILY_LIMIT_TEMPLATES.get(
        language, _DAILY_LIMIT_TEMPLATES[_DEFAULT_DAILY_LIMIT_LANG]
    )
