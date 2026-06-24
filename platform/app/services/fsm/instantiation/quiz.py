"""Quiz FSM builder.

Ported from IVRv2/app/fsm/quiz.py — import paths updated, logic unchanged.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.providers.vonage_actions.input_action import InputAction
from app.providers.vonage_actions.stream_action import StreamAction
from app.providers.vonage_actions.talk_action import TalkAction
from app.services.fsm.operations.quiz_init_state_operation import QuizInitStateOperation
from app.services.fsm.operations.quiz_post_state_operation import QuizPostStateOperation
from app.services.fsm.operations.quiz_process_state_output import QuizProcessFinalStateOutput
from app.services.fsm.state import State
from app.services.fsm.transition import Transition

if TYPE_CHECKING:
    from app.services.fsm.fsm import FSM


class _Option:
    def __init__(self, key: int, value: str) -> None:
        self.key = key
        self.value = value


class _Menu:
    def __init__(self, description: str, options: list, level: int) -> None:
        self.description = description
        self.options = options
        self.level = level

    def dict(self, **kwargs) -> dict:  # noqa: ANN001
        return {
            "description": self.description,
            "options": [{"key": o.key, "value": o.value} for o in (self.options or [])],
            "level": self.level,
        }


class Quiz:
    """Builds IVR quiz states and transitions into an FSM."""

    def __init__(self, quiz_data) -> None:  # noqa: ANN001
        self.quiz_data = quiz_data
        self.input_action = InputAction(type_=["dtmf"], eventApi="/dtmf")
        self.move_forward_key = "1"
        self.type = "quiz"

    def generate_states(
        self,
        fsm: FSM,
        prefix_state_id: str,
        parent_block_state_id: str,
        key_chosen: int,
        level: int,
    ) -> FSM:
        initial_quiz_state_id = f"{prefix_state_id}_QuizStart"
        initial_state = self.get_initial_state(initial_quiz_state_id, level)
        fsm.add_state(initial_state)

        parent_to_initial = Transition(
            input=str(key_chosen),
            source_state_id=parent_block_state_id,
            dest_state_id=initial_quiz_state_id,
        )
        fsm.add_transition(parent_to_initial)

        mapping_questionids_common_ids = []

        for index, question in enumerate(self.quiz_data.questions):
            question_state_id = f"{prefix_state_id}_Question{index + 1}"
            actions = [StreamAction(url=question.question.url)]
            transitions = []
            mapping = {"question_id": question_state_id}
            cor_or_wrong_state_ids = []

            correct_option_text = next(
                opt.text for opt in question.options if opt.id == question.correct_option_id
            )

            for index_option, option in enumerate(question.options):
                actions.append(StreamAction(url=option.url))
                if option.id == question.correct_option_id:
                    correct_state = self.get_correct_option_state(
                        prefix_state_id, f"Q{index + 1}-O{index_option + 1}"
                    )
                    fsm.add_state(correct_state)
                    cor_or_wrong_state_ids.append(correct_state.id)
                    transitions.append(
                        Transition(
                            input=str(index_option + 1),
                            source_state_id=question_state_id,
                            dest_state_id=correct_state.id,
                        )
                    )
                else:
                    incorrect_state = self.get_incorrect_option_state(
                        prefix_state_id,
                        f"Q{index + 1}-O{index_option + 1}",
                        correct_option_text,
                    )
                    fsm.add_state(incorrect_state)
                    cor_or_wrong_state_ids.append(incorrect_state.id)
                    transitions.append(
                        Transition(
                            input=str(index_option + 1),
                            source_state_id=question_state_id,
                            dest_state_id=incorrect_state.id,
                        )
                    )

            actions.append(TalkAction(text="Please select an option."))
            actions.append(TalkAction(text="To replay the question, press 8."))
            actions.append(self.input_action)
            mapping["cor_or_wrong_state_ids"] = cor_or_wrong_state_ids
            mapping_questionids_common_ids.append(mapping)

            question_state = State(state_id=question_state_id, actions=actions)
            fsm.add_state(question_state)
            fsm.add_transition(
                Transition(
                    input="8",
                    source_state_id=question_state_id,
                    dest_state_id=question_state_id,
                )
            )
            for t in transitions:
                fsm.add_transition(t)

        final_state = self.get_final_state(prefix_state_id, level)
        fsm.add_state(final_state)

        for index, mapping in enumerate(mapping_questionids_common_ids):
            if index == len(mapping_questionids_common_ids) - 1:
                for state_id in mapping["cor_or_wrong_state_ids"]:
                    fsm.add_transition(
                        Transition(
                            input=self.move_forward_key,
                            source_state_id=state_id,
                            dest_state_id=final_state.id,
                        )
                    )
            else:
                if index == 0:
                    fsm.add_transition(
                        Transition(
                            input=self.move_forward_key,
                            source_state_id=initial_quiz_state_id,
                            dest_state_id=mapping["question_id"],
                        )
                    )
                for state_id in mapping["cor_or_wrong_state_ids"]:
                    fsm.add_transition(
                        Transition(
                            input=self.move_forward_key,
                            source_state_id=state_id,
                            dest_state_id=mapping_questionids_common_ids[index + 1]["question_id"],
                        )
                    )

        fsm.add_transition(
            Transition(
                input=self.move_forward_key,
                source_state_id=final_state.id,
                dest_state_id=parent_block_state_id,
            )
        )
        return fsm

    def get_initial_state(self, initial_quiz_state_id: str, level: int) -> State:
        actions = [
            TalkAction(text=f"Welcome to the {self.quiz_data.title} quiz!"),
            TalkAction(text="Let's get started!"),
            TalkAction(text="Press 1 to start the quiz."),
            self.input_action,
        ]
        post_operation = QuizInitStateOperation()
        options = [_Option(key=1, value="Start Quiz")]
        menu = _Menu(
            description=f"{self.quiz_data.title} welcome state",
            options=options,
            level=level,
        )
        return State(
            state_id=initial_quiz_state_id,
            actions=actions,
            post_operation=post_operation,
            menu=menu,
        )

    def get_final_state(self, prefix_state_id: str, level: int) -> State:
        actions = [
            TalkAction(text="Congratulations! You have completed the quiz."),
            TalkAction(text="Press 1 to exit the quiz."),
            self.input_action,
        ]
        state_id = f"{prefix_state_id}_{self.quiz_data.id}_final_state"
        return State(
            state_id=state_id,
            actions=actions,
            process_operation_output_into_actions=QuizProcessFinalStateOutput(),
        )

    def get_correct_option_state(self, prefix_state_id: str, state_id_append: str) -> State:
        actions = [
            TalkAction(text="Congratulations! You have selected the correct option."),
            TalkAction(text="You have earned 5 points."),
            TalkAction(text="Press 1 to continue to the next question."),
            self.input_action,
        ]
        return State(
            state_id=f"{prefix_state_id}_correct_state_{state_id_append}",
            actions=actions,
            post_operation=QuizPostStateOperation(score=self.quiz_data.positiveMarks),
        )

    def get_incorrect_option_state(
        self, prefix_state_id: str, state_id_append: str, correct_option_text: str
    ) -> State:
        actions = [
            TalkAction(text="Sorry, that is incorrect."),
            TalkAction(text=f"The correct option is {correct_option_text}."),
            TalkAction(text="Press 1 to continue to the next question."),
            self.input_action,
        ]
        return State(
            state_id=f"{prefix_state_id}_incorrect_state_{state_id_append}",
            actions=actions,
            post_operation=QuizPostStateOperation(score=-self.quiz_data.negativeMarks),
        )
