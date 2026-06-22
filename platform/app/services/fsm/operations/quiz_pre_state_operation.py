"""QuizPreStateOperation — no-op pre-operation for quiz states.

Ported from IVRv2/app/fsm/operations/quiz_pre_state_operation.py.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.providers.vonage_actions.base.fsm_operation import FSMOperation

if TYPE_CHECKING:
    from app.models.ivr_state import IVRCallStateMongoDoc
    from app.services.fsm.fsm import FSM


class QuizPreStateOperation(FSMOperation):
    def execute(
        self, fsm: FSM, fsm_state_doc: IVRCallStateMongoDoc | None = None
    ) -> Any:
        pass
