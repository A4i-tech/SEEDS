"""VonageInputAction — Vonage-specific DTMF input action.

Ported from IVRv2/app/actions/vonage_actions/vonage_input_action.py.
"""

from __future__ import annotations

from typing import List

from app.providers.vonage_actions.input_action import InputAction


class VonageInputAction(InputAction):
    """Collects DTMF digits from the caller and posts to Vonage eventUrl."""

    def __init__(
        self,
        type_: List[str],
        maxDigits: int,
        eventUrl: str,
        timeOut: int,
        submitOnHash: bool,
    ) -> None:
        self.type = type_
        self.maxDigits = maxDigits
        self.eventUrl = eventUrl
        self.submitOnHash = submitOnHash
        self.timeOut = timeOut

    def get(self, sas_gen_obj) -> dict:  # type: ignore[no-untyped-def]
        action: dict = {
            "type": self.type,
            "action": "input",
            "eventUrl": [self.eventUrl],
        }
        if "dtmf" in self.type:
            action["dtmf"] = {
                "maxDigits": self.maxDigits,
                "submitOnHash": self.submitOnHash,
                "timeOut": self.timeOut,
            }
        return action
