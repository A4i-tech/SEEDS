from app.base_classes.action import Action
from app.base_classes.base_process_operation_output import ProcessOperationOutput
from app.utils.model_classes import IVRCallStateMongoDoc

class EmptyProcessStateOutput(ProcessOperationOutput):
    def execute(self, state, op_output, fsm_state_doc: IVRCallStateMongoDoc = None) -> [Action]:
        return state.actions