"""
Pause/resume announcement utility for IVR audio playback.

Provides multi-language announcement text for pause/resume controls.
"""

# Pause/resume instruction announcements (before playback)
PAUSE_INSTRUCTIONS = {
    "kannada": "ವಿರಾಮಗೊಳಿಸಲು ಅಥವಾ ಮುಂದುವರಿಸಲು ಶೂನ್ಯವನ್ನು ಒತ್ತಿರಿ",  # Press zero to pause or resume
    "english": "Press zero to pause or resume",
    "hindi": "रोकने या फिर से शुरू करने के लिए शून्य दबाएं",  # Press zero to pause or resume
    "bengali": "বিরতি দিতে বা পুনরায় শুরু করতে শূন্য টিপুন",  # Press zero to pause or resume
    "tamil": "இடைநிறுத்த அல்லது தொடர பூஜ்ஜியத்தை அழுத்தவும்",  # Press zero to pause or resume
    "marathi": "विराम देण्यासाठी किंवा पुन्हा सुरू करण्यासाठी शून्य दाबा",  # Press zero to pause or resume
}

# Paused state announcements (when user presses 0 to pause)
PAUSED_ANNOUNCEMENTS = {
    "kannada": "ವಿರಾಮಗೊಳಿಸಲಾಗಿದೆ. ಮುಂದುವರಿಸಲು ಶೂನ್ಯವನ್ನು ಒತ್ತಿರಿ",  # Paused. Press zero to resume
    "english": "Paused. Press zero to resume",
    "hindi": "रोका गया. फिर से शुरू करने के लिए शून्य दबाएं",  # Paused. Press zero to resume
    "bengali": "বিরতি দেওয়া হয়েছে. পুনরায় শুরু করতে শূন্য টিপুন",  # Paused. Press zero to resume
    "tamil": "இடைநிறுத்தப்பட்டது. தொடர பூஜ்ஜியத்தை அழுத்தவும்",  # Paused. Press zero to resume
    "marathi": "विराम दिला आहे. पुन्हा सुरू करण्यासाठी शून्य दाबा",  # Paused. Press zero to resume
}

# Resuming state announcements (when user presses 0 to resume)
RESUMING_ANNOUNCEMENTS = {
    "kannada": "ಮುಂದುವರಿಸಲಾಗುತ್ತಿದೆ",  # Resuming
    "english": "Resuming",
    "hindi": "फिर से शुरू किया जा रहा है",  # Resuming
    "bengali": "পুনরায় শুরু করা হচ্ছে",  # Resuming
    "tamil": "தொடர்கிறது",  # Resuming
    "marathi": "पुन्हा सुरू करत आहे",  # Resuming
}


def get_pause_instruction(language: str) -> str:
    """
    Get pause/resume instruction text for the specified language.

    Args:
        language: Language code (kannada, english, hindi, bengali, tamil, marathi)

    Returns:
        Instruction text in the specified language
    """
    return PAUSE_INSTRUCTIONS.get(language, PAUSE_INSTRUCTIONS["english"])


def get_paused_announcement(language: str) -> str:
    """
    Get "paused" announcement text for the specified language.

    Args:
        language: Language code (kannada, english, hindi, bengali, tamil, marathi)

    Returns:
        Paused announcement text in the specified language
    """
    return PAUSED_ANNOUNCEMENTS.get(language, PAUSED_ANNOUNCEMENTS["english"])


def get_resuming_announcement(language: str) -> str:
    """
    Get "resuming" announcement text for the specified language.

    Args:
        language: Language code (kannada, english, hindi, bengali, tamil, marathi)

    Returns:
        Resuming announcement text in the specified language
    """
    return RESUMING_ANNOUNCEMENTS.get(language, RESUMING_ANNOUNCEMENTS["english"])
