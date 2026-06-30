"""DailyLimitPreOperation — stores daily-limit metadata for async check.

Ported from IVRv2/app/fsm/operations/daily_limit_pre_operation.py.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from app.providers.vonage_actions.base.fsm_operation import FSMOperation

if TYPE_CHECKING:
    from app.models.ivr_state import IVRCallStateMongoDoc
    from app.services.fsm.fsm import FSM

logger = logging.getLogger(__name__)


class DailyLimitPreOperation(FSMOperation):
    """Pre-operation hook that flags a daily-limit check in experience_data.

    The actual async check and increment happen in FSM.get_next_actions()
    because FSMOperation.execute() is synchronous.
    """

    def __init__(
        self, duration_seconds: float, language: str, school_id: str = ""
    ) -> None:
        self.duration_seconds = duration_seconds
        self.language = language
        self.school_id = school_id

    def execute(
        self, fsm: FSM, fsm_state_doc: IVRCallStateMongoDoc | None = None
    ) -> Any:
        if fsm_state_doc is not None:
            fsm_state_doc.experience_data["_daily_limit_check"] = {
                "duration_seconds": self.duration_seconds,
                "language": self.language,
                "school_id": self.school_id,
            }
