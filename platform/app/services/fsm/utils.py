"""
FSM utility functions shared across the IVR FSM engine.

Ported from IVRv2/app/utils/ — contains only the subset used by FSM internals.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

# IST is UTC+5:30
_IST = timezone(timedelta(hours=5, minutes=30))


def get_ist_date_string() -> str:
    """Get current date in IST as YYYY-MM-DD string."""
    return datetime.now(_IST).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Language utilities
# ---------------------------------------------------------------------------

_LANGUAGE_MAPPING: dict[str, str] = {
    "kn": "kn-IN",
    "en": "en-US",
    "hi": "hi-IN",
    "bn": "bn-IN",
    "ta": "ta-IN",
    "mr": "mr-IN",
}

_ISO_TO_BLOB_NAME: dict[str, str] = {
    "en": "english",
    "kn": "kannada",
    "hi": "hindi",
    "bn": "bengali",
    "ta": "tamil",
    "mr": "marathi",
    "or": "odia",
}


def get_vonage_language_code(language: str) -> str:
    """Map an ISO 639-1 language code to a Vonage TTS language code.

    Falls back to "en-US" for unknown languages.
    """
    return _LANGUAGE_MAPPING.get(language.lower(), "en-US")


def get_blob_language_name(iso: str) -> str:
    """Return the Azure blob folder name for an ISO 639-1 code.

    Falls back to the input value if unknown.
    """
    return _ISO_TO_BLOB_NAME.get(iso.lower(), iso)


# ---------------------------------------------------------------------------
# Daily limit announcements
# ---------------------------------------------------------------------------

_DAILY_LIMIT_TEMPLATES: dict[str, str] = {
    "kn": (
        "ನೀವು ಇಂದಿನ ದೈನಂದಿನ ಆಲಿಸುವ ಮಿತಿಯನ್ನು ತಲುಪಿದ್ದೀರಿ. "
        "ದಯವಿಟ್ಟು ನಾಳೆ ಮತ್ತೆ ಕರೆ ಮಾಡಿ."
    ),
    "en": "You have reached your daily listening limit. Please call back tomorrow.",
    "hi": "आपने अपनी दैनिक सुनने की सीमा पूरी कर ली है। कृपया कल फिर से कॉल करें।",
    "bn": "আপনি আজকের শোনার সীমায় পৌঁছে গেছেন। দয়া করে আগামীকাল আবার কল করুন।",
    "ta": "நீங்கள் இன்றைய கேட்கும் வரம்பை எட்டிவிட்டீர்கள். தயவுசெய்து நாளை மீண்டும் அழைக்கவும்.",
    "mr": "तुम्ही आजची ऐकण्याची मर्यादा गाठली आहे. कृपया उद्या पुन्हा कॉल करा.",
}


def get_daily_limit_announcement(language: str) -> str:
    """Return the daily-limit-reached announcement for *language*."""
    return _DAILY_LIMIT_TEMPLATES.get(language, _DAILY_LIMIT_TEMPLATES["en"])
