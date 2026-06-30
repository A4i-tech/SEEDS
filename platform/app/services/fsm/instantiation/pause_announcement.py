"""Pause/resume announcement helpers.

Ported from IVRv2/app/utils/pause_announcement.py.
"""

from __future__ import annotations

PAUSE_INSTRUCTIONS = {
    "kannada": "ವಿರಾಮಗೊಳಿಸಲು ಅಥವಾ ಮುಂದುವರಿಸಲು ಶೂನ್ಯವನ್ನು ಒತ್ತಿರಿ",
    "english": "Press zero to pause or resume",
    "hindi": "रोकने या फिर से शुरू करने के लिए शून्य दबाएं",
    "bengali": "বিরতি দিতে বা পুনরায় শুরু করতে শূন্য টিপুন",
    "tamil": "இடைநிறுத்த அல்லது தொடர பூஜ்ஜியத்தை அழுத்தவும்",
    "marathi": "विराम देण्यासाठी किंवा पुन्हा सुरू करण्यासाठी शून्य दाबा",
}

PAUSED_ANNOUNCEMENTS = {
    "kannada": "ವಿರಾಮಗೊಳಿಸಲಾಗಿದೆ. ಮುಂದುವರಿಸಲು ಶೂನ್ಯವನ್ನು ಒತ್ತಿರಿ",
    "english": "Paused. Press zero to resume",
    "hindi": "रोका गया. फिर से शुरू करने के लिए शून्य दबाएं",
    "bengali": "বিরতি দেওয়া হয়েছে. পুনরায় শুরু করতে শূন্য টিপুন",
    "tamil": "இடைநிறுத்தப்பட்டது. தொடர பூஜ்ஜியத்தை அழுத்தவும்",
    "marathi": "विराम दिला आहे. पुन्हा सुरू करण्यासाठी शून्य दाबा",
}

RESUMING_ANNOUNCEMENTS = {
    "kannada": "ಮುಂದುವರಿಸಲಾಗುತ್ತಿದೆ",
    "english": "Resuming",
    "hindi": "फिर से शुरू किया जा रहा है",
    "bengali": "পুনরায় শুরু করা হচ্ছে",
    "tamil": "தொடர்கிறது",
    "marathi": "पुन्हा सुरू करत आहे",
}


def get_pause_instruction(language: str) -> str:
    return PAUSE_INSTRUCTIONS.get(language, PAUSE_INSTRUCTIONS["english"])


def get_paused_announcement(language: str) -> str:
    return PAUSED_ANNOUNCEMENTS.get(language, PAUSED_ANNOUNCEMENTS["english"])


def get_resuming_announcement(language: str) -> str:
    return RESUMING_ANNOUNCEMENTS.get(language, RESUMING_ANNOUNCEMENTS["english"])
