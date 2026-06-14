"""QuizPreStateOperation — no-op pre-operation for quiz states.

Ported from IVRv2/app/fsm/operations/quiz_pre_state_operation.py.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from app.providers.vonage_actions.base.fsm_operation import FSMOperation

if TYPE_CHECKING:
    from app.services.fsm.fsm import FSM
    from app.models.ivr_state import IVRCallStateMongoDoc


class QuizPreStateOperation(FSMOperation):
    def execute(
        self, fsm: "FSM", fsm_state_doc: "IVRCallStateMongoDoc | None" = None
    ) -> Any:
        pass
