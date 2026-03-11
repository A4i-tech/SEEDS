from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance
from app.models.participant import CallStatus
from datetime import datetime, timezone
from app.models.action_history import ActionHistory, ActionType
from app.services.caller_state_manager import caller_state_manager
import asyncio

class HoldDetectedEvent(ConferenceEvent):
    def __init__(self, phone_number: str, conf_call):
        self.phone_number = phone_number
        self.conf_call = conf_call

    async def execute_event(self):
        logger_instance.info(f"EXECUTING HOLD DETECTED EVENT {self.phone_number}")
        
        participant = self.conf_call.state.participants.get(self.phone_number)
        if participant:
            if participant.call_status == CallStatus.ON_HOLD:
                return

            participant.call_status = CallStatus.ON_HOLD
            self.conf_call.state.hold_detected = True

            asyncio.create_task(
                caller_state_manager.update_state(
                    conference_id=self.conf_call.conf_id,
                    participant_id=self.phone_number,
                    new_state={"call_status": CallStatus.ON_HOLD.value, "onHold": True},
                )
            )

            self.conf_call.state.action_history.append(
                ActionHistory(
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    action_type=ActionType.SYSTEM_HOLD_DETECTED,
                    metadata={"phone_number": self.phone_number, "status": CallStatus.ON_HOLD.value},
                    owner="system",
                )
            )
            
            await self.conf_call.update_state()
        else:
            logger_instance.warning(f"Participant {self.phone_number} not found for HoldDetectedEvent")
