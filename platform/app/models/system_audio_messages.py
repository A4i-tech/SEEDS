"""System audio message URLs (from ConferenceV2 models/system_audio_messages.py).

The blob account name is resolved lazily from settings so that this module can
be imported without STORAGE_ACCOUNT_NAME set (e.g. in unit tests).
"""
from __future__ import annotations

import logging
from enum import Enum

logger = logging.getLogger(__name__)


def _base_url() -> str:
    """Return the Azure Blob base URL for conference audio messages."""
    try:
        from app.platform.settings import get_settings  # noqa: PLC0415

        name = get_settings().storage_account_name or get_settings().azure_storage_account_name
        if name:
            return (
                f"https://{name}.blob.core.windows.net"
                "/conference/conferenceMessagesWav/english/"
            )
    except Exception:
        pass
    return "https://placeholder.blob.core.windows.net/conference/conferenceMessagesWav/english/"


class SystemAudioMessages(str, Enum):
    WELCOME_TEACHER = "teacher_welcome_message.wav"
    WELCOME_STUDENT = "student_welcome_message.wav"
    TEACHER_HAS_JOINED = "teacher_has_joined.wav"
    STUDENT_HAS_JOINED = "student_has_joined.wav"
    STUDENT_HAS_RAISED_HAND = "student_has_raised_hand.wav"
    STUDENT_IS_MUTED = "student_is_muted.wav"
    STUDENT_IS_UNMUTED = "student_is_unmuted.wav"
    TEACHER_HAS_DROPPED = "teacher_has_dropped_from_call.wav"
    STUDENT_HAS_DROPPED = "student_has_dropped_from_call.wav"

    @property
    def url(self) -> str:
        """Return the full blob URL for this audio message."""
        return _base_url() + self.value
