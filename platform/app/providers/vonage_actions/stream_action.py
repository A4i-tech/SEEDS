"""StreamAction — audio file streaming action.

Ported from IVRv2/app/actions/base_actions/stream_action.py.
"""

from __future__ import annotations

from app.providers.vonage_actions.base.action import Action


class StreamAction(Action):
    """Streams an audio file (mp3 / wav) to a Conversation."""

    def __init__(
        self,
        url: str,
        record_playback_time: bool = False,
        **kwargs: object,
    ) -> None:
        self.url = url
        self.record_playback_time = record_playback_time
        self.extra_args = kwargs

    def get(self, sas_gen_obj):  # type: ignore[no-untyped-def]
        raise NotImplementedError("get() called on base StreamAction")

    def __str__(self) -> str:
        return f"StreamAction: {self.url} {self.extra_args}"
