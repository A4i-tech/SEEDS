"""TalkAction — synthesised speech action.

Ported from IVRv2/app/actions/base_actions/talk_action.py.
"""

from __future__ import annotations

from app.providers.vonage_actions.base.action import Action


class TalkAction(Action):
    """Sends synthesised speech to a Conversation."""

    def __init__(self, text: str, **kwargs: object) -> None:
        self.text = text
        self.extra_args = kwargs

    def get(self, sas_gen_obj):  # type: ignore[no-untyped-def]
        raise NotImplementedError("get() called on base TalkAction")

    def __str__(self) -> str:
        return f"TalkAction: {self.text} {self.extra_args}"
