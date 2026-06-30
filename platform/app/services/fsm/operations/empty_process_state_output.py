"""EmptyProcessStateOutput — returns state actions unchanged.

Ported from IVRv2/app/fsm/operations/empty_process_state_output.py.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.providers.vonage_actions.base.action import Action
from app.providers.vonage_actions.base.process_operation_output import ProcessOperationOutput

if TYPE_CHECKING:
    from app.models.ivr_state import IVRCallStateMongoDoc


class EmptyProcessStateOutput(ProcessOperationOutput):
    def execute(
        self,
        state: object,
        op_output: object,
        fsm_state_doc: IVRCallStateMongoDoc | None = None,
    ) -> list[Action]:
        return state.actions  # type: ignore[attr-defined]
