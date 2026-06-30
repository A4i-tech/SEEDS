from typing import Any
from app.base_classes.base_fsm_operation import FSMOperation
from app.fsm.fsm import FSM
from app.utils.model_classes import IVRCallStateMongoDoc

class QuizPreStateOperation(FSMOperation):
    def execute(self, fsm: FSM, fsm_state_doc: IVRCallStateMongoDoc = None) -> Any:
        pass