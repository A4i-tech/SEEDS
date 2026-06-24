"""Speed control helpers for IVR FSM instantiation.

Ported from IVRv2/app/utils/speed_control.py.
"""

from __future__ import annotations

MIN_SPEED = 0.75
MAX_SPEED = 2.0
SPEED_INCREMENT = 0.25
SUPPORTED_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0]

_SPEED_ANNOUNCEMENTS: dict[str, dict] = {
    "kannada": {"instruction": "ನಿಧಾನಗೊಳಿಸಲು ಸ್ಟಾರ್ ಒತ್ತಿರಿ, ವೇಗಗೊಳಿಸಲು ಹ್ಯಾಶ್ ಒತ್ತಿರಿ"},
    "english": {"instruction": "Press star to slow down, press hash to speed up"},
    "hindi": {"instruction": "धीमा करने के लिए स्टार दबाएं, तेज करने के लिए हैश दबाएं"},
    "bengali": {"instruction": "ধীর করতে স্টার চাপুন, দ্রুত করতে হ্যাশ চাপুন"},
    "tamil": {"instruction": "மெதுவாக்க ஸ்டார் அழுத்தவும், வேகமாக்க ஹாஷ் அழுத்தவும்"},
    "marathi": {"instruction": "हळू करण्यासाठी स्टार दाबा, वेगवान करण्यासाठी हॅश दाबा"},
}


def increase_speed(current_speed: float) -> tuple[float, bool]:
    """Increase playback speed by one step. Returns (new_speed, at_max)."""
    if not (MIN_SPEED <= current_speed <= MAX_SPEED):
        current_speed = 1.0
    if current_speed >= MAX_SPEED:
        return current_speed, True
    new_speed = min([s for s in SUPPORTED_SPEEDS if s > current_speed], default=MAX_SPEED)
    return new_speed, new_speed == MAX_SPEED


def decrease_speed(current_speed: float) -> tuple[float, bool]:
    """Decrease playback speed by one step. Returns (new_speed, at_min)."""
    if not (MIN_SPEED <= current_speed <= MAX_SPEED):
        current_speed = 1.0
    if current_speed <= MIN_SPEED:
        return current_speed, True
    new_speed = max([s for s in SUPPORTED_SPEEDS if s < current_speed], default=MIN_SPEED)
    return new_speed, new_speed == MIN_SPEED


def get_speed_instruction(language: str) -> str:
    lang = _SPEED_ANNOUNCEMENTS.get(language.lower(), _SPEED_ANNOUNCEMENTS["english"])
    return lang["instruction"]
