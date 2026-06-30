"""FSM Transition — links two states on a given DTMF input key.

Ported from IVRv2/app/fsm/transition.py — import paths updated.
"""

from __future__ import annotations

from app.providers.vonage_actions.base.action import Action


class Transition:
    """Represents a directed edge in the FSM graph."""

    def __init__(
        self,
        input: str,  # noqa: A002 — keep original parameter name
        source_state_id: str,
        dest_state_id: str,
        actions: list[Action] | None = None,
    ) -> None:
        self.input = input
        self.source_state_id = source_state_id
        self.dest_state_id = dest_state_id
        self.actions: list[Action] = actions if actions is not None else []

    def to_json(self) -> dict:
        return {
            "input": self.input,
            "source_state_id": self.source_state_id,
            "dest_state_id": self.dest_state_id,
            "actions": [a.to_json() for a in self.actions],
        }

    def __str__(self) -> str:
        return f"Transition: {self.source_state_id} -> {self.dest_state_id} on '{self.input}'"

    @staticmethod
    def from_json(data: dict) -> Transition:
        actions = [Action.from_json(a) for a in data["actions"]]
        return Transition(
            input=data["input"],
            source_state_id=data["source_state_id"],
            dest_state_id=data["dest_state_id"],
            actions=actions,
        )
