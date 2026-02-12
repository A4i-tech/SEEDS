from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance
from app.models.participant import CallStatus

class HoldDetectedEvent(ConferenceEvent):
    def __init__(self, phone_number: str, conf_call):
        super().__init__(conf_call)
        self.phone_number = phone_number

    async def execute_event(self):
        logger_instance.info(f"EXECUTING HOLD DETECTED EVENT {self.phone_number}")
        
        participant = self.conf_call.state.participants.get(self.phone_number)
        if participant:
            participant.call_status = CallStatus.ON_HOLD
            
            # Log the action
            from app.models.action_history import ActionHistory, ActionType
            from datetime import datetime
            
            self.conf_call.state.action_history.append(ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.SYSTEM_DETECTED_HOLD, 
                metadata={"phone_number": self.phone_number, "status": "on_hold"},
                owner="System"
            ))
            
            await self.conf_call.update_state()
        else:
            logger_instance.warning(f"Participant {self.phone_number} not found for HoldDetectedEvent")
