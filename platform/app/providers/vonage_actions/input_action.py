"""InputAction — DTMF / speech input collection action.

Ported from IVRv2/app/actions/base_actions/input_action.py.
"""

from __future__ import annotations

from app.providers.vonage_actions.base.action import Action


class InputAction(Action):
    """Collects DTMF digits or speech from the caller."""

    def __init__(
        self,
        type_: list[str],
        eventApi: str,
        **kwargs: object,
    ) -> None:
        self.type = type_
        self.eventApi = eventApi
        self.extra_args = kwargs

    def get(self, sas_gen_obj):  # type: ignore[no-untyped-def]
        raise NotImplementedError("get() called on base InputAction")

    def __str__(self) -> str:
        return f"InputAction: {self.type} {self.eventApi} {self.extra_args}"
