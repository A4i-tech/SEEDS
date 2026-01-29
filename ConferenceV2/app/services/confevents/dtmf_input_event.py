from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.system_audio_messages import SystemAudioMessages
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.confevents.base_event import ConferenceEvent
from app.services.confevents.mute_all_event import MuteAllEvent
from app.services.confevents.unmute_all_event import UnmuteAllEvent
from app.models.participant import Role, Participant
from app.services.conference_call import ConferenceCall
from app.conf_logger import logger_instance
from app.services.singletons.websocket_service import WebsocketService


class DTMFInputEvent(ConferenceEvent):
    def __init__(self, phone_number: str, digit: str, conf_call: ConferenceCall):
        self.phone_number = phone_number
        self.digit = digit
        self.conf_call = conf_call

    async def execute_event(self):
        if self.phone_number not in self.conf_call.state.participants:
            return
        participant: Participant = self.conf_call.state.participants[self.phone_number]
        state = self.conf_call.state

        # DTMF 1: mute all (teacher or leader only)
        if self.digit == "1":
            if participant.role == Role.TEACHER or self.phone_number == state.leader_phone_number:
                logger_instance.info(f"HANDLING DTMF 1 (mute all) from {self.phone_number}")
                await self.conf_call.queue_event(MuteAllEvent(conf_call=self.conf_call))
            return

        # DTMF 3: unmute all (teacher or leader only)
        if self.digit == "3":
            if participant.role == Role.TEACHER or self.phone_number == state.leader_phone_number:
                logger_instance.info(f"HANDLING DTMF 3 (unmute all) from {self.phone_number}")
                await self.conf_call.queue_event(UnmuteAllEvent(conf_call=self.conf_call))
            return

        # Flip raise hand state: if participant is a student, input is "0", and hand is not already raised
        if participant.role == Role.STUDENT and self.digit == "0" and not participant.is_raised:
            logger_instance.info("HANDLING DTMF INPUT EVENT", self)
            participant.is_raised = True
            participant.raised_at = int(datetime.now().timestamp())

            await self.conf_call.stream_system_message(SystemAudioMessages.STUDENT_HAS_RAISED_HAND)

            self.conf_call.state.action_history.append(ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.STUDENT_RAISE_HAND_STATE_CHANGE,
                metadata={
                    "phone_number": participant.phone_number,
                    "raised_hand": participant.is_raised,
                    "raised_at": participant.raised_at
                },
                owner=participant.phone_number
            ))

            await self.conf_call.update_state()
        # Digits other than 0, 1, 3: silent reject (no-op)
