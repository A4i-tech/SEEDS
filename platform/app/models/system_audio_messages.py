"""System audio message URLs (from ConferenceV2 models/system_audio_messages.py).

The base URL is resolved lazily from the storage provider so that this module can
be imported without storage settings (e.g. in unit tests).
"""
from __future__ import annotations

import logging
from enum import StrEnum

logger = logging.getLogger(__name__)


def _base_url() -> str:
    from app.providers.blob_storage import get_blob_storage_provider  # noqa: PLC0415

    return get_blob_storage_provider().blob_url("conference", "") + "conferenceMessagesWav/english/"


class SystemAudioMessages(StrEnum):
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
