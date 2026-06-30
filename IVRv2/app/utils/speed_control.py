"""
Playback speed control utility for IVRv2.

Manages speed increase/decrease logic with supported speed increments.
"""

from typing import Tuple, Dict

# Speed control constants
MIN_SPEED = 0.75
MAX_SPEED = 2.0
SPEED_INCREMENT = 0.25
SUPPORTED_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0]

# Module-level constant for speed announcements (keyed by ISO 639-1 codes)
_SPEED_ANNOUNCEMENTS: Dict[str, dict] = {
    "kn": {
        "instruction": "ನಿಧಾನಗೊಳಿಸಲು ಸ್ಟಾರ್ ಒತ್ತಿರಿ, ವೇಗಗೊಳಿಸಲು ಹ್ಯಾಶ್ ಒತ್ತಿರಿ",
        0.75: "ವೇಗ ನಿಧಾನಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ",
        1.0: "ವೇಗ ಸಾಮಾನ್ಯಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ",
        1.25: "ವೇಗ ವೇಗಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ",
        1.5: "ವೇಗ ಅತಿ ವೇಗಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ",
        2.0: "ವೇಗ ಅತ್ಯಂತ ವೇಗಕ್ಕೆ ಹೊಂದಿಸಲಾಗಿದೆ"
    },
    "en": {
        "instruction": "Press star to slow down, press hash to speed up",
        0.75: "Speed set to slow",
        1.0: "Speed set to normal",
        1.25: "Speed set to fast",
        1.5: "Speed set to very fast",
        2.0: "Speed set to ultra fast"
    },
    "hi": {
        "instruction": "धीमा करने के लिए स्टार दबाएं, तेज करने के लिए हैश दबाएं",
        0.75: "गति धीमी पर सेट की गई",
        1.0: "गति सामान्य पर सेट की गई",
        1.25: "गति तेज पर सेट की गई",
        1.5: "गति बहुत तेज पर सेट की गई",
        2.0: "गति अति तेज पर सेट की गई"
    },
    "bn": {
        "instruction": "ধীর করতে স্টার চাপুন, দ্রুত করতে হ্যাশ চাপুন",
        0.75: "গতি ধীরে সেট করা হয়েছে",
        1.0: "গতি সাধারণে সেট করা হয়েছে",
        1.25: "গতি দ্রুতে সেট করা হয়েছে",
        1.5: "গতি খুব দ্রুতে সেট করা হয়েছে",
        2.0: "গতি অতি দ্রুতে সেট করা হয়েছে"
    },
    "ta": {
        "instruction": "மெதுவாக்க ஸ்டார் அழுத்தவும், வேகமாக்க ஹாஷ் அழுத்தவும்",
        0.75: "வேகம் மெதுவாக அமைக்கப்பட்டது",
        1.0: "வேகம் சாதாரணமாக அமைக்கப்பட்டது",
        1.25: "வேகம் விரைவாக அமைக்கப்பட்டது",
        1.5: "வேகம் மிக விரைவாக அமைக்கப்பட்டது",
        2.0: "வேகம் அதி விரைவாக அமைக்கப்பட்டது"
    },
    "mr": {
        "instruction": "हळू करण्यासाठी स्टार दाबा, वेगवान करण्यासाठी हॅश दाबा",
        0.75: "वेग हळू वर सेट केला",
        1.0: "वेग सामान्य वर सेट केला",
        1.25: "वेग वेगवान वर सेट केला",
        1.5: "वेग खूप वेगवान वर सेट केला",
        2.0: "वेग अति वेगवान वर सेट केला"
    }
}


def increase_speed(current_speed: float) -> Tuple[float, bool]:
    """
    Increases playback speed by 0.25x.

    Args:
        current_speed: Current playback speed (0.75 - 2.0)

    Returns:
        Tuple of (new_speed, at_max_limit)
        - new_speed: Updated speed value
        - at_max_limit: True if already at maximum speed

    Examples:
        >>> increase_speed(1.0)
        (1.25, False)

        >>> increase_speed(2.0)
        (2.0, True)
    """
    # Validate and clamp input to valid range
    if not (MIN_SPEED <= current_speed <= MAX_SPEED):
        current_speed = 1.0  # Reset to default if invalid

    if current_speed >= MAX_SPEED:
        return current_speed, True  # Already at max

    new_speed = round(current_speed + SPEED_INCREMENT, 2)
    if new_speed > MAX_SPEED:
        new_speed = MAX_SPEED

    # Snap to nearest supported speed
    if new_speed not in SUPPORTED_SPEEDS:
        new_speed = min([s for s in SUPPORTED_SPEEDS if s > current_speed], default=MAX_SPEED)

    return new_speed, new_speed == MAX_SPEED


def decrease_speed(current_speed: float) -> Tuple[float, bool]:
    """
    Decreases playback speed by 0.25x.

    Args:
        current_speed: Current playback speed (0.75 - 2.0)

    Returns:
        Tuple of (new_speed, at_min_limit)
        - new_speed: Updated speed value
        - at_min_limit: True if already at minimum speed

    Examples:
        >>> decrease_speed(1.0)
        (0.75, False)

        >>> decrease_speed(0.75)
        (0.75, True)
    """
    # Validate and clamp input to valid range
    if not (MIN_SPEED <= current_speed <= MAX_SPEED):
        current_speed = 1.0  # Reset to default if invalid

    if current_speed <= MIN_SPEED:
        return current_speed, True  # Already at min

    new_speed = round(current_speed - SPEED_INCREMENT, 2)
    if new_speed < MIN_SPEED:
        new_speed = MIN_SPEED

    # Snap to nearest supported speed
    if new_speed not in SUPPORTED_SPEEDS:
        new_speed = max([s for s in SUPPORTED_SPEEDS if s < current_speed], default=MIN_SPEED)

    return new_speed, new_speed == MIN_SPEED


def get_speed_instruction(language: str) -> str:
    """
    Gets the speed control instruction text for initial announcement.

    Args:
        language: ISO 639-1 code (e.g. "kn", "en", "hi", "bn", "ta", "mr")

    Returns:
        Instruction text in the specified language

    Examples:
        >>> get_speed_instruction("en")
        "Press star to slow down, press hash to speed up"
    """
    lang_announcements = _SPEED_ANNOUNCEMENTS.get(language.lower(), _SPEED_ANNOUNCEMENTS["en"])
    return lang_announcements["instruction"]
