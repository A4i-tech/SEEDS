"""QuizPostStateOperation — updates quiz score on answer selection.

Ported from IVRv2/app/fsm/operations/quiz_post_state_operation.py.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.providers.vonage_actions.base.fsm_operation import FSMOperation

if TYPE_CHECKING:
    from app.models.ivr_state import IVRCallStateMongoDoc
    from app.services.fsm.fsm import FSM


class QuizPostStateOperation(FSMOperation):
    def __init__(self, score: int) -> None:
        self.score = score

    def execute(
        self, fsm: FSM, fsm_state_doc: IVRCallStateMongoDoc | None = None
    ) -> Any:
        if fsm_state_doc is not None:
            current_score = fsm_state_doc.experience_data["quiz"]["score"]
            fsm_state_doc.experience_data["quiz"]["score"] = current_score + self.score
