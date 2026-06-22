"""Speed control helpers for IVR FSM instantiation.

Ported from IVRv2/app/utils/speed_control.py — get_speed_instruction only.
"""

from __future__ import annotations

_SPEED_ANNOUNCEMENTS: dict[str, dict] = {
    "kannada": {"instruction": "ನಿಧಾನಗೊಳಿಸಲು ಸ್ಟಾರ್ ಒತ್ತಿರಿ, ವೇಗಗೊಳಿಸಲು ಹ್ಯಾಶ್ ಒತ್ತಿರಿ"},
    "english": {"instruction": "Press star to slow down, press hash to speed up"},
    "hindi": {"instruction": "धीमा करने के लिए स्टार दबाएं, तेज करने के लिए हैश दबाएं"},
    "bengali": {"instruction": "ধীর করতে স্টার চাপুন, দ্রুত করতে হ্যাশ চাপুন"},
    "tamil": {"instruction": "மெதுவாக்க ஸ்டார் அழுத்தவும், வேகமாக்க ஹாஷ் அழுத்தவும்"},
    "marathi": {"instruction": "हळू करण्यासाठी स्टार दाबा, वेगवान करण्यासाठी हॅश दाबा"},
}


def get_speed_instruction(language: str) -> str:
    lang = _SPEED_ANNOUNCEMENTS.get(language.lower(), _SPEED_ANNOUNCEMENTS["english"])
    return lang["instruction"]
