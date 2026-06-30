"""VonageStreamAction — Vonage-specific audio stream action.

Ported from IVRv2/app/actions/vonage_actions/vonage_stream_action.py.
"""

from __future__ import annotations

from app.providers.vonage_actions.stream_action import StreamAction


class VonageStreamAction(StreamAction):
    """Streams an audio file to a Vonage Conversation."""

    default_level = 1
    default_bargeIn = True
    default_loop = 1

    def __init__(
        self,
        streamUrl: str,
        level: float,
        bargeIn: bool,
        loop: int,
    ) -> None:
        self.streamUrl = streamUrl
        self.level = level
        self.bargeIn = bargeIn
        self.loop = loop

    def get(self, sas_gen_obj) -> dict:  # type: ignore[no-untyped-def]
        return {
            "action": "stream",
            "streamUrl": [sas_gen_obj.get_url_with_sas(self.streamUrl)],
            "loop": self.loop,
            "bargeIn": self.bargeIn,
            "level": self.level,
        }
