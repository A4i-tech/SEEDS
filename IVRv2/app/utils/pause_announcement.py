"""
Pause/resume announcement utility for IVR audio playback.

Provides multi-language announcement text for pause/resume controls.
"""

# Pause/resume instruction announcements (before playback)
PAUSE_INSTRUCTIONS = {
    "kn": "ವಿರಾಮಗೊಳಿಸಲು ಅಥವಾ ಮುಂದುವರಿಸಲು ಶೂನ್ಯವನ್ನು ಒತ್ತಿರಿ",  # Press zero to pause or resume
    "en": "Press zero to pause or resume",
    "hi": "रोकने या फिर से शुरू करने के लिए शून्य दबाएं",  # Press zero to pause or resume
    "bn": "বিরতি দিতে বা পুনরায় শুরু করতে শূন্য টিপুন",  # Press zero to pause or resume
    "ta": "இடைநிறுத்த அல்லது தொடர பூஜ்ஜியத்தை அழுத்தவும்",  # Press zero to pause or resume
    "mr": "विराम देण्यासाठी किंवा पुन्हा सुरू करण्यासाठी शून्य दाबा",  # Press zero to pause or resume
}

# Paused state announcements (when user presses 0 to pause)
PAUSED_ANNOUNCEMENTS = {
    "kn": "ವಿರಾಮಗೊಳಿಸಲಾಗಿದೆ. ಮುಂದುವರಿಸಲು ಶೂನ್ಯವನ್ನು ಒತ್ತಿರಿ",  # Paused. Press zero to resume
    "en": "Paused. Press zero to resume",
    "hi": "रोका गया. फिर से शुरू करने के लिए शून्य दबाएं",  # Paused. Press zero to resume
    "bn": "বিরতি দেওয়া হয়েছে. পুনরায় শুরু করতে শূন্য টিপুন",  # Paused. Press zero to resume
    "ta": "இடைநிறுத்தப்பட்டது. தொடர பூஜ்ஜியத்தை அழுத்தவும்",  # Paused. Press zero to resume
    "mr": "विराम दिला आहे. पुन्हा सुरू करण्यासाठी शून्य दाबा",  # Paused. Press zero to resume
}

# Resuming state announcements (when user presses 0 to resume)
RESUMING_ANNOUNCEMENTS = {
    "kn": "ಮುಂದುವರಿಸಲಾಗುತ್ತಿದೆ",  # Resuming
    "en": "Resuming",
    "hi": "फिर से शुरू किया जा रहा है",  # Resuming
    "bn": "পুনরায় শুরু করা হচ্ছে",  # Resuming
    "ta": "தொடர்கிறது",  # Resuming
    "mr": "पुन्हा सुरू करत आहे",  # Resuming
}


def get_pause_instruction(language: str) -> str:
    """
    Get pause/resume instruction text for the specified language.

    Args:
        language: ISO 639-1 code (e.g. "kn", "en", "hi", "bn", "ta", "mr")

    Returns:
        Instruction text in the specified language
    """
    return PAUSE_INSTRUCTIONS.get(language, PAUSE_INSTRUCTIONS["en"])


def get_paused_announcement(language: str) -> str:
    """
    Get "paused" announcement text for the specified language.

    Args:
        language: ISO 639-1 code (e.g. "kn", "en", "hi", "bn", "ta", "mr")

    Returns:
        Paused announcement text in the specified language
    """
    return PAUSED_ANNOUNCEMENTS.get(language, PAUSED_ANNOUNCEMENTS["en"])


def get_resuming_announcement(language: str) -> str:
    """
    Get "resuming" announcement text for the specified language.

    Args:
        language: ISO 639-1 code (e.g. "kn", "en", "hi", "bn", "ta", "mr")

    Returns:
        Resuming announcement text in the specified language
    """
    return RESUMING_ANNOUNCEMENTS.get(language, RESUMING_ANNOUNCEMENTS["en"])
