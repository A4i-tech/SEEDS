from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance


class RevokeLeaderEvent(ConferenceEvent):
    """
    Event to revoke the conference leader.
    Only teachers can trigger this via API.
    """
    def __init__(self, conf_call: ConferenceCall):
        self.conf_call = conf_call

    async def execute_event(self):
        logger_instance.info(f"EXECUTING REVOKE LEADER EVENT conf_id={self.conf_call.conf_id}")

        teacher = self.conf_call.state.get_teacher()
        if not teacher:
            logger_instance.error("No teacher found in conference", self.conf_call.conf_id)
            return

        # Idempotent: already no leader
        if self.conf_call.state.leader_phone_number is None:
            return

        previous_leader = self.conf_call.state.leader_phone_number
        self.conf_call.state.leader_phone_number = None

        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.TEACHER_REVOKE_LEADER,
                metadata={"previous_leader_phone_number": previous_leader},
                owner=self.conf_call.state.teacher_phone_number,
            )
        )

        await self.conf_call.update_state()
        logger_instance.info(f"REVOKE LEADER completed conf_id={self.conf_call.conf_id}")
