from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance


class AssignLeaderEvent(ConferenceEvent):
    """
    Event to assign a student as the conference leader.
    Exactly one leader per conference; assigning a new leader overwrites the previous.
    Only teachers can trigger this via API.
    """
    def __init__(self, phone_number: str, conf_call: ConferenceCall):
        self.phone_number = phone_number
        self.conf_call = conf_call

    async def execute_event(self):
        logger_instance.info(f"EXECUTING ASSIGN LEADER EVENT conf_id={self.conf_call.conf_id} phone={self.phone_number}")

        teacher = self.conf_call.state.get_teacher()
        if not teacher:
            logger_instance.error("No teacher found in conference", self.conf_call.conf_id)
            return

        # Idempotent: already this leader
        if self.conf_call.state.leader_phone_number == self.phone_number:
            return

        self.conf_call.state.leader_phone_number = self.phone_number

        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.TEACHER_ASSIGN_LEADER,
                metadata={"leader_phone_number": self.phone_number},
                owner=self.conf_call.state.teacher_phone_number,
            )
        )

        await self.conf_call.update_state()
        logger_instance.info(f"ASSIGN LEADER completed conf_id={self.conf_call.conf_id} phone={self.phone_number}")
