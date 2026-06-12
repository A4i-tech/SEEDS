from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.participant import CallStatus, Role
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance


class RemoveParticipantEvent(ConferenceEvent):
    def __init__(self, phone_number: str, conf_call: ConferenceCall):
        self.phone_number = phone_number
        self.conf_call = conf_call

    async def execute_event(self):
        # TODO: Speak out announcement messages in conversation through comm API, check if the participant is already removed
        if self.phone_number in self.conf_call.state.participants:
            participant = self.conf_call.state.participants[self.phone_number]
            remaining_numbers = [
                number
                for number, current_participant in self.conf_call.state.participants.items()
                if number != self.phone_number
                and current_participant.call_status == CallStatus.CONNECTED
            ]
            if remaining_numbers:
                leave_text = (
                    "Teacher has left"
                    if participant.role == Role.TEACHER
                    else f"{participant.name} has left"
                )
                await self.conf_call.communication_api.play_announcement_to_conference(
                    leave_text, remaining_numbers
                )

            try:
                # Remove the participant via communication API
                await self.conf_call.communication_api.remove_participant(self.phone_number)
            except Exception:
                # Hangup did not happen (timeout, SDK error) — keep the
                # participant in state so the teacher can retry, but push the
                # truthful state so the frontend un-sticks.
                logger_instance.error(
                    f"Remove failed for {self.phone_number}; resyncing state"
                )
                await self.conf_call.update_state()
                raise

            # Delete the participant from the conference state
            del self.conf_call.state.participants[self.phone_number]

            # Log the removal in the action history
            self.conf_call.state.action_history.append(
                ActionHistory(
                    timestamp=datetime.now().isoformat(),
                    action_type=ActionType.TEACHER_REMOVE_STUDENT,
                    metadata={"phone_number": self.phone_number},
                    owner=self.conf_call.state.teacher_phone_number,
                )
            )

            # Update the conference call state
            await self.conf_call.update_state()
