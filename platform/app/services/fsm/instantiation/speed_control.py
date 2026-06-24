"""Speed control helpers for IVR FSM instantiation.

Ported from IVRv2/app/utils/speed_control.py.
"""

from __future__ import annotations

MIN_SPEED = 0.75
MAX_SPEED = 2.0
SUPPORTED_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0]

_SPEED_ANNOUNCEMENTS: dict[str, dict] = {
    "kn": {"instruction": "ನಿಧಾನಗೊಳಿಸಲು ಸ್ಟಾರ್ ಒತ್ತಿರಿ, ವೇಗಗೊಳಿಸಲು ಹ್ಯಾಶ್ ಒತ್ತಿರಿ"},
    "en": {"instruction": "Press star to slow down, press hash to speed up"},
    "hi": {"instruction": "धीमा करने के लिए स्टार दबाएं, तेज करने के लिए हैश दबाएं"},
    "bn": {"instruction": "ধীর করতে স্টার চাপুন, দ্রুত করতে হ্যাশ চাপুন"},
    "ta": {"instruction": "மெதுவாக்க ஸ்டார் அழுத்தவும், வேகமாக்க ஹாஷ் அழுத்தவும்"},
    "mr": {"instruction": "हळू करण्यासाठी स्टार दाबा, वेगवान करण्यासाठी हॅश दाबा"},
}


def get_speed_instruction(language: str) -> str:
    lang = _SPEED_ANNOUNCEMENTS.get(language.lower(), _SPEED_ANNOUNCEMENTS["en"])
    return lang["instruction"]


def increase_speed(current_speed: float) -> tuple[float, bool]:
    if not (MIN_SPEED <= current_speed <= MAX_SPEED):
        current_speed = 1.0
    if current_speed >= MAX_SPEED:
        return current_speed, True
    new_speed = min([s for s in SUPPORTED_SPEEDS if s > current_speed], default=MAX_SPEED)
    return new_speed, new_speed == MAX_SPEED


def decrease_speed(current_speed: float) -> tuple[float, bool]:
    if not (MIN_SPEED <= current_speed <= MAX_SPEED):
        current_speed = 1.0
    if current_speed <= MIN_SPEED:
        return current_speed, True
    new_speed = max([s for s in SUPPORTED_SPEEDS if s < current_speed], default=MIN_SPEED)
    return new_speed, new_speed == MIN_SPEED
