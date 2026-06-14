"""FSM State — a single node in the IVR call-flow graph.

Ported from IVRv2/app/fsm/state.py — import paths updated.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Dict, List, Optional

from app.providers.vonage_actions.base.action import Action
from app.providers.vonage_actions.base.fsm_operation import FSMOperation
from app.providers.vonage_actions.base.process_operation_output import ProcessOperationOutput
from app.providers.vonage_actions.stream_action import StreamAction
from app.services.fsm.transition import Transition

if TYPE_CHECKING:
    pass


# Lazy imports to avoid circular dependency with FSM operations package
def _get_empty_state_operation():  # type: ignore[no-untyped-def]
    from app.services.fsm.operations.empty_state_operation import EmptyStateOperation  # noqa: PLC0415
    return EmptyStateOperation()


def _get_empty_process_state_output():  # type: ignore[no-untyped-def]
    from app.services.fsm.operations.empty_process_state_output import EmptyProcessStateOutput  # noqa: PLC0415
    return EmptyProcessStateOutput()


class State:
    """A single node in the FSM graph."""

    def __init__(
        self,
        state_id: str,
        actions: Optional[List[Action]] = None,
        post_operation: Optional[FSMOperation] = None,
        pre_operation: Optional[FSMOperation] = None,
        process_operation_output_into_actions: Optional[ProcessOperationOutput] = None,
        menu=None,  # Optional[Menu] — avoid circular import
    ) -> None:
        self.id = state_id
        self.actions: List[Action] = actions if actions is not None else []
        self.transition_map: Dict[str, Transition] = {}
        self.post_operation: FSMOperation = (
            post_operation if post_operation is not None else _get_empty_state_operation()
        )
        self.pre_operation: FSMOperation = (
            pre_operation if pre_operation is not None else _get_empty_state_operation()
        )
        self.process_operation_output_into_actions: ProcessOperationOutput = (
            process_operation_output_into_actions
            if process_operation_output_into_actions is not None
            else _get_empty_process_state_output()
        )
        self.menu = menu

    def add_transition(self, transition: Transition) -> None:
        if transition.input in self.transition_map:
            raise ValueError(f"Transition for input '{transition.input}' already exists")
        self.transition_map[transition.input] = transition

    def get_stream_action_with_record_playback_option(self) -> List[StreamAction]:
        return [
            a for a in self.actions if isinstance(a, StreamAction) and a.record_playback_time
        ]

    def serialize_transitions(self) -> List[dict]:
        return [t.to_json() for t in self.transition_map.values()]

    def serialize(self) -> dict:
        return {
            "id": self.id,
            "actions": [a.to_json() for a in self.actions],
            "post_operation": self.post_operation.to_json(),
            "pre_operation": self.pre_operation.to_json(),
            "process_operation_output_into_actions": self.process_operation_output_into_actions.to_json(),
            "menu": self.menu.dict() if self.menu is not None else None,
        }

    @staticmethod
    def from_json(data: dict) -> "State":
        state = State(state_id=data["id"])
        for action_json in data["actions"]:
            state.actions.append(Action.from_json(action_json))
        if "menu" in data and data["menu"] is not None:
            from app.models.ivr_state import Menu  # noqa: PLC0415  # type: ignore[attr-defined]
            try:
                state.menu = Menu(**data["menu"])
            except Exception:  # noqa: BLE001
                pass
        if (
            "post_operation" in data
            and "pre_operation" in data
            and "process_operation_output_into_actions" in data
        ):
            state.post_operation = FSMOperation.from_json(data["post_operation"])
            state.pre_operation = FSMOperation.from_json(data["pre_operation"])
            state.process_operation_output_into_actions = ProcessOperationOutput.from_json(
                data["process_operation_output_into_actions"]
            )
        return state
