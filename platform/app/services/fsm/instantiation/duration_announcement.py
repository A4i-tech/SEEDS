"""Duration announcement helpers.

Ported from IVRv2/app/utils/duration_announcement.py.
"""

from __future__ import annotations

_DURATION_TEMPLATES: dict[str, dict[str, str]] = {
    "kannada": {
        "full": "ಈ ವಿಷಯವು {minutes} ನಿಮಿಷ {seconds} ಸೆಕೆಂಡುಗಳ ಅವಧಿಯದ್ದಾಗಿದೆ",
        "minutes_only": "ಈ ವಿಷಯವು {minutes} ನಿಮಿಷಗಳ ಅವಧಿಯದ್ದಾಗಿದೆ",
        "seconds_only": "ಈ ವಿಷಯವು {seconds} ಸೆಕೆಂಡುಗಳ ಅವಧಿಯದ್ದಾಗಿದೆ",
    },
    "english": {
        "full": "This content is {minutes} minutes {seconds} seconds long",
        "minutes_only": "This content is {minutes} minutes long",
        "seconds_only": "This content is {seconds} seconds long",
    },
    "hindi": {
        "full": "यह सामग्री {minutes} मिनट {seconds} सेकंड लंबी है",
        "minutes_only": "यह सामग्री {minutes} मिनट लंबी है",
        "seconds_only": "यह सामग्री {seconds} सेकंड लंबी है",
    },
    "bengali": {
        "full": "এই বিষয়বস্তু {minutes} মিনিট {seconds} সেকেন্ড দীর্ঘ",
        "minutes_only": "এই বিষয়বস্তু {minutes} মিনিট দীর্ঘ",
        "seconds_only": "এই বিষয়বস্তু {seconds} সেকেন্ড দীর্ঘ",
    },
    "tamil": {
        "full": "இந்த உள்ளடக்கம் {minutes} நிமிடங்கள் {seconds} விநாடிகள் நீளமானது",
        "minutes_only": "இந்த உள்ளடக்கம் {minutes} நிமிடங்கள் நீளமானது",
        "seconds_only": "இந்த உள்ளடக்கம் {seconds} விநாடிகள் நீளமானது",
    },
    "marathi": {
        "full": "ही सामग्री {minutes} मिनिटे {seconds} सेकंद लांब आहे",
        "minutes_only": "ही सामग्री {minutes} मिनिटे लांब आहे",
        "seconds_only": "ही सामग्री {seconds} सेकंद लांब आहे",
    },
}


def format_duration_announcement(duration_seconds: float | None, language: str) -> str:
    if duration_seconds is None or duration_seconds <= 0:
        return ""
    minutes = int(duration_seconds // 60)
    seconds = int(duration_seconds % 60)
    lang_templates = _DURATION_TEMPLATES.get(language, _DURATION_TEMPLATES["english"])
    if minutes > 0 and seconds > 0:
        return lang_templates["full"].format(minutes=minutes, seconds=seconds)
    elif minutes > 0:
        return lang_templates["minutes_only"].format(minutes=minutes)
    else:
        return lang_templates["seconds_only"].format(seconds=seconds)
