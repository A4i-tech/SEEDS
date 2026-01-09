from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.participant import CallStatus, Participant, Role
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.confevents.mute_participant_event import MuteParticipantEvent
from app.conf_logger import logger_instance


class AddParticipantEvent(ConferenceEvent):
    def __init__(self, phone_number: str, conf_call: ConferenceCall):
        self.phone_number = phone_number
        self.conf_call = conf_call

    async def execute_event(self):
        # TODO: Speak out announcement messages in conversation through comm API
        current_participants_dict = self.conf_call.state.participants

        # Check if it's a new participant
        if self.phone_number not in current_participants_dict:
            await self.conf_call.communication_api.add_participant(self.phone_number)
            participant = Participant(
                name="Student",
                phone_number=self.phone_number,
                role=Role.STUDENT,
                call_status=CallStatus.DISCONNECTED,
                is_muted=True  # Students default to muted
            )
            current_participants_dict[self.phone_number] = participant

            # Proactively queue mute event (belt and suspenders approach)
            logger_instance.info(f"Queuing proactive mute event for new student {self.phone_number}")
            await self.conf_call.queue_event(
                MuteParticipantEvent(
                    phone_number=self.phone_number,
                    conf_call=self.conf_call,
                    stream_system_message=False,
                    max_retries=3,
                    initial_delay=2.0  # Longer initial delay for transfer completion
                )
            )

        # If it's an old participant, check if the participant is already connected
        elif current_participants_dict[self.phone_number].call_status != CallStatus.CONNECTED:
            await self.conf_call.communication_api.add_participant(self.phone_number)
            current_participants_dict[self.phone_number].call_status = CallStatus.CONNECTING

        # Update action history
        self.conf_call.state.action_history.append(ActionHistory(
            timestamp=datetime.now().isoformat(),
            action_type=ActionType.TEACHER_ADD_STUDENT,
            metadata={
                "phone_number": self.phone_number
            },
            owner=self.conf_call.state.teacher_phone_number
        ))

        # Update conference call state
        await self.conf_call.update_state()
