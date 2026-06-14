"""QuizInitStateOperation — initialises quiz score in experience_data.

Ported from IVRv2/app/fsm/operations/quiz_init_state_operation.py.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from app.providers.vonage_actions.base.fsm_operation import FSMOperation

if TYPE_CHECKING:
    from app.services.fsm.fsm import FSM
    from app.models.ivr_state import IVRCallStateMongoDoc


class QuizInitStateOperation(FSMOperation):
    def execute(
        self, fsm: "FSM", fsm_state_doc: "IVRCallStateMongoDoc | None" = None
    ) -> Any:
        if fsm_state_doc is not None:
            fsm_state_doc.experience_data["quiz"] = {"score": 0}
