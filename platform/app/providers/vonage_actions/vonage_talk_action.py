"""VonageTalkAction — Vonage-specific TTS talk action.

Ported from IVRv2/app/actions/vonage_actions/vonage_talk_action.py.
"""

from __future__ import annotations

from app.providers.vonage_actions.talk_action import TalkAction


class VonageTalkAction(TalkAction):
    """Sends synthesised speech to a Vonage Conversation."""

    default_bargeIn = True
    default_level = 1
    default_loop = 1
    default_language = "en-US"

    def __init__(
        self,
        text: str,
        level: float,
        bargeIn: bool,
        loop: int,
        language: str,
    ) -> None:
        self.text = text
        self.level = level
        self.bargeIn = bargeIn
        self.loop = loop
        self.language = language

    def get(self, sas_gen_obj) -> dict:  # type: ignore[no-untyped-def]
        return {
            "action": "talk",
            "text": self.text,
            "loop": self.loop,
            "bargeIn": self.bargeIn,
            "level": self.level,
            "language": self.language,
        }
