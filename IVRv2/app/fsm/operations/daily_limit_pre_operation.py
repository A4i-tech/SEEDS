import logging
from typing import Any

from app.base_classes.base_fsm_operation import FSMOperation
from app.fsm.fsm import FSM
from app.utils.model_classes import IVRCallStateMongoDoc

logger = logging.getLogger(__name__)


class DailyLimitPreOperation(FSMOperation):
    """Pre-operation hook that checks daily listening limit before content playback.

    Stores the content duration and language so the limit can be checked
    and usage incremented when the student navigates to a content state.

    The actual async limit check and increment happens in get_next_actions()
    since FSMOperation.execute() is synchronous. This operation stores the
    metadata needed for the check.
    """

    def __init__(self, duration_seconds: float, language: str, school_id: str = ""):
        self.duration_seconds = duration_seconds
        self.language = language
        self.school_id = school_id

    def execute(self, fsm: FSM, fsm_state_doc: IVRCallStateMongoDoc = None) -> Any:
        """Store daily limit metadata in experience_data for async processing.

        The actual limit check is async and handled in fsm.get_next_actions().
        This synchronous hook just marks that a limit check is needed.
        """
        if fsm_state_doc is not None:
            fsm_state_doc.experience_data["_daily_limit_check"] = {
                "duration_seconds": self.duration_seconds,
                "language": self.language,
                "school_id": self.school_id,
            }
