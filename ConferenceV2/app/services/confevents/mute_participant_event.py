from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.system_audio_messages import SystemAudioMessages
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance
import asyncio


class MuteParticipantEvent(ConferenceEvent):
    def __init__(self, phone_number: str, conf_call: ConferenceCall, stream_system_message: bool = True):
        self.phone_number = phone_number
        self.conf_call = conf_call
        self.stream_system_message = stream_system_message

    async def execute_event(self):
        if self.phone_number not in self.conf_call.state.participants:
            # A silent return here looks like a successful mute to the caller
            # and the frontend never gets a state update — log and resync.
            logger_instance.warning(
                f"Mute requested for unknown participant {self.phone_number}; "
                f"known: {list(self.conf_call.state.participants.keys())}"
            )
            await self.conf_call.update_state()
            return

        logger_instance.info("EXECUTING MUTE PARTICIPANT EVENT", self.phone_number)

        try:
            # Mute the participant using communication API
            await self.conf_call.communication_api.mute_participant(self.phone_number)
        except Exception:
            # The Vonage action did not happen (timeout, stale leg, 400, ...):
            # don't flip is_muted, but push the truthful state so the frontend
            # un-sticks, then let the caller (queue loop / MuteAllEvent) log it.
            logger_instance.error(
                f"Mute failed for {self.phone_number}; resyncing state"
            )
            await self.conf_call.update_state()
            raise

        # Update the participant's muted status
        self.conf_call.state.participants[self.phone_number].is_muted = True

        if self.stream_system_message and self.phone_number != self.conf_call.state.get_teacher().phone_number:
            await self.conf_call.stream_system_message(SystemAudioMessages.STUDENT_IS_MUTED)

        # Log the action in the action history
        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.TEACHER_MUTE_UNMUTE_STUDENT,
                metadata={
                    "phone_number": self.phone_number,
                    "is_muted": True
                },
                owner=self.conf_call.state.teacher_phone_number
            )
        )

        # Update the conference call state
        await self.conf_call.update_state()
