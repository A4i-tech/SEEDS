"""
Duration announcement utility for IVRv2.

Formats audio duration into human-readable announcements in multiple languages.
"""

from typing import Optional, Dict


# Duration templates for each language (module-level constant for performance)
_DURATION_TEMPLATES: Dict[str, Dict[str, str]] = {
    "kannada": {
        "full": "ಈ ವಿಷಯವು {minutes} ನಿಮಿಷ {seconds} ಸೆಕೆಂಡುಗಳ ಅವಧಿಯದ್ದಾಗಿದೆ",
        "minutes_only": "ಈ ವಿಷಯವು {minutes} ನಿಮಿಷಗಳ ಅವಧಿಯದ್ದಾಗಿದೆ",
        "seconds_only": "ಈ ವಿಷಯವು {seconds} ಸೆಕೆಂಡುಗಳ ಅವಧಿಯದ್ದಾಗಿದೆ"
    },
    "english": {
        "full": "This content is {minutes} minutes {seconds} seconds long",
        "minutes_only": "This content is {minutes} minutes long",
        "seconds_only": "This content is {seconds} seconds long"
    },
    "hindi": {
        "full": "यह सामग्री {minutes} मिनट {seconds} सेकंड लंबी है",
        "minutes_only": "यह सामग्री {minutes} मिनट लंबी है",
        "seconds_only": "यह सामग्री {seconds} सेकंड लंबी है"
    },
    "bengali": {
        "full": "এই বিষয়বস্তু {minutes} মিনিট {seconds} সেকেন্ড দীর্ঘ",
        "minutes_only": "এই বিষয়বস্তু {minutes} মিনিট দীর্ঘ",
        "seconds_only": "এই বিষয়বস্তু {seconds} সেকেন্ড দীর্ঘ"
    },
    "tamil": {
        "full": "இந்த உள்ளடக்கம் {minutes} நிமிடங்கள் {seconds} விநாடிகள் நீளமானது",
        "minutes_only": "இந்த உள்ளடக்கம் {minutes} நிமிடங்கள் நீளமானது",
        "seconds_only": "இந்த உள்ளடக்கம் {seconds} விநாடிகள் நீளமானது"
    },
    "marathi": {
        "full": "ही सामग्री {minutes} मिनिटे {seconds} सेकंद लांब आहे",
        "minutes_only": "ही सामग्री {minutes} मिनिटे लांब आहे",
        "seconds_only": "ही सामग्री {seconds} सेकंद लांब आहे"
    }
}


def format_duration_announcement(duration_seconds: Optional[float], language: str) -> str:
    """
    Formats duration into a human-readable announcement.

    Args:
        duration_seconds: Duration in seconds (can be None for backwards compatibility)
        language: Language code (kannada, english, hindi, bengali, tamil, marathi)

    Returns:
        Formatted duration announcement text, or empty string if duration is None

    Examples:
        >>> format_duration_announcement(270, "english")
        "This content is 4 minutes 30 seconds long"

        >>> format_duration_announcement(65, "kannada")
        "ಈ ವಿಷಯವು 1 ನಿಮಿಷ 5 ಸೆಕೆಂಡುಗಳ ಅವಧಿಯದ್ದಾಗಿದೆ"

        >>> format_duration_announcement(None, "english")
        ""
    """
    # Handle None or invalid duration (backwards compatibility)
    if duration_seconds is None or duration_seconds <= 0:
        return ""

    # Calculate minutes and seconds
    minutes = int(duration_seconds // 60)
    seconds = int(duration_seconds % 60)

    # Get templates for language (default to English)
    lang_templates = _DURATION_TEMPLATES.get(language, _DURATION_TEMPLATES["english"])

    # Select appropriate template based on duration
    if minutes > 0 and seconds > 0:
        template = lang_templates["full"]
        return template.format(minutes=minutes, seconds=seconds)
    elif minutes > 0:
        template = lang_templates["minutes_only"]
        return template.format(minutes=minutes)
    else:
        template = lang_templates["seconds_only"]
        return template.format(seconds=seconds)
