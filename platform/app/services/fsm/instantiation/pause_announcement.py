"""Pause/resume announcement helpers.

Ported from IVRv2/app/utils/pause_announcement.py.
"""

from __future__ import annotations

PAUSE_INSTRUCTIONS = {
    "kn": "ವಿರಾಮಗೊಳಿಸಲು ಅಥವಾ ಮುಂದುವರಿಸಲು ಶೂನ್ಯವನ್ನು ಒತ್ತಿರಿ",
    "en": "Press zero to pause or resume",
    "hi": "रोकने या फिर से शुरू करने के लिए शून्य दबाएं",
    "bn": "বিরতি দিতে বা পুনরায় শুরু করতে শূন্য টিপুন",
    "ta": "இடைநிறுத்த அல்லது தொடர பூஜ்ஜியத்தை அழுத்தவும்",
    "mr": "विराम देण्यासाठी किंवा पुन्हा सुरू करण्यासाठी शून्य दाबा",
}

PAUSED_ANNOUNCEMENTS = {
    "kn": "ವಿರಾಮಗೊಳಿಸಲಾಗಿದೆ. ಮುಂದುವರಿಸಲು ಶೂನ್ಯವನ್ನು ಒತ್ತಿರಿ",
    "en": "Paused. Press zero to resume",
    "hi": "रोका गया. फिर से शुरू करने के लिए शून्य दबाएं",
    "bn": "বিরতি দেওয়া হয়েছে. পুনরায় শুরু করতে শূন্য টিপুন",
    "ta": "இடைநிறுத்தப்பட்டது. தொடர பூஜ்ஜியத்தை அழுத்தவும்",
    "mr": "विराम दिला आहे. पुन्हा सुरू करण्यासाठी शून्य दाबा",
}

RESUMING_ANNOUNCEMENTS = {
    "kn": "ಮುಂದುವರಿಸಲಾಗುತ್ತಿದೆ",
    "en": "Resuming",
    "hi": "फिर से शुरू किया जा रहा है",
    "bn": "পুনরায় শুরু করা হচ্ছে",
    "ta": "தொடர்கிறது",
    "mr": "पुन्हा सुरू करत आहे",
}


def get_pause_instruction(language: str) -> str:
    return PAUSE_INSTRUCTIONS.get(language, PAUSE_INSTRUCTIONS["en"])


def get_paused_announcement(language: str) -> str:
    return PAUSED_ANNOUNCEMENTS.get(language, PAUSED_ANNOUNCEMENTS["en"])


def get_resuming_announcement(language: str) -> str:
    return RESUMING_ANNOUNCEMENTS.get(language, RESUMING_ANNOUNCEMENTS["en"])
