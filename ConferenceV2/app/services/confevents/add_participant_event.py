from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.participant import CallStatus, Participant, Role
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent


class AddParticipantEvent(ConferenceEvent):
    def __init__(self, phone_number: str, name: str | None = None, conf_call: ConferenceCall = None):
        self.phone_number = phone_number
        self.name = name
        self.conf_call = conf_call

    async def execute_event(self):
        # TODO: Speak out announcement messages in conversation through comm API
        current_participants_dict = self.conf_call.state.participants

        # Check if it's a new participant
        if self.phone_number not in current_participants_dict:
            
            await self.conf_call.communication_api.add_participant(self.phone_number, announce_text=self.name)
            participant = Participant(
                name=self.name or "Student",
                phone_number=self.phone_number,
                role=Role.STUDENT,
                call_status=CallStatus.DISCONNECTED,
                is_muted=True,  # Students start muted at Vonage API level
                added_after_start=True,
            )
            current_participants_dict[self.phone_number] = participant

        # If it's an old participant, check if the participant is already connected
        elif current_participants_dict[self.phone_number].call_status != CallStatus.CONNECTED:
            await self.conf_call.communication_api.add_participant(self.phone_number, announce_text=self.name)
            current_participants_dict[self.phone_number].call_status = CallStatus.CONNECTING
            # Update participant name if provided to avoid stale names in announcements
            if self.name:
                current_participants_dict[self.phone_number].name = self.name

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
