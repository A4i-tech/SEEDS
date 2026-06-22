"""QuizProcessFinalStateOutput — injects final score announcement into actions.

Ported from IVRv2/app/fsm/operations/quiz_process_state_output.py.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.providers.vonage_actions.base.action import Action
from app.providers.vonage_actions.base.process_operation_output import ProcessOperationOutput
from app.providers.vonage_actions.talk_action import TalkAction

if TYPE_CHECKING:
    from app.models.ivr_state import IVRCallStateMongoDoc


class QuizProcessFinalStateOutput(ProcessOperationOutput):
    def execute(
        self,
        state: object,
        op_output: object,
        fsm_state_doc: IVRCallStateMongoDoc | None = None,
    ) -> list[Action]:
        current_score = fsm_state_doc.experience_data["quiz"]["score"]  # type: ignore[union-attr]
        score_action = TalkAction(text=f"Your final score is {current_score}.")
        final_actions = [state.actions[0]] + [score_action] + state.actions[1:]  # type: ignore[attr-defined]
        state.actions = final_actions  # type: ignore[attr-defined]
        return state.actions  # type: ignore[attr-defined]
