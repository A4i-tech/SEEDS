"""VonageActionAccumulator — converts Action objects to Vonage NCCO dicts.

Ported from IVRv2/app/actions/vonage_actions/vonage_action_accumulator.py.
"""

from __future__ import annotations

from typing import List

from app.providers.vonage_actions.base.action import Action


class VonageActionAccumulator:
    """Combines a list of Action objects into Vonage NCCO-compatible dicts."""

    def __init__(self) -> None:
        from app.providers.blob_storage import SASGenerator  # noqa: PLC0415

        self._sas_gen = SASGenerator()

    def combine(self, actions: List[Action]) -> List[dict]:
        return [x.get(self._sas_gen) for x in actions]
