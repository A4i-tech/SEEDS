from app.models.participant import CallStatus, Participant
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance


class CallStatusChangeEvent(ConferenceEvent):
    def __init__(
        self, phone_number: str, status: CallStatus, conf_call: ConferenceCall
    ):
        self.phone_number = phone_number
        self.status = status
        self.conf_call = conf_call

    async def execute_event(self):
        if self.phone_number in self.conf_call.state.participants:
            participant: Participant = self.conf_call.state.participants[
                self.phone_number
            ]
            if participant.call_status != self.status:
                logger_instance.info(
                    "EXECUTING CALL STATUS CHANGE EVENT FOR NUMBER",
                    self.phone_number,
                    "STATUS:",
                    self.status.value,
                )
                participant.call_status = self.status

                connected_numbers = [
                    number
                    for number, current_participant in self.conf_call.state.participants.items()
                    if current_participant.call_status == CallStatus.CONNECTED
                ]

                if self.status == CallStatus.CONNECTED:
                    is_teacher = (
                        self.conf_call.state.get_teacher().phone_number
                        == participant.phone_number
                    )
                    recipients = [
                        number
                        for number in connected_numbers
                        if number != participant.phone_number
                    ]
                    try:
                        join_text = (
                            "Teacher has joined"
                            if is_teacher
                            else f"{participant.name} has joined"
                        )
                        if recipients:
                            await self.conf_call.communication_api.play_announcement_to_conference(
                                join_text, recipients
                            )

                        if not is_teacher:
                            teacher = self.conf_call.state.get_teacher()
                            if (
                                teacher
                                and teacher.call_status == CallStatus.CONNECTED
                                and teacher.phone_number != participant.phone_number
                            ):
                                await self.conf_call.communication_api.play_announcement_to_conference(
                                    "Teacher has joined", [participant.phone_number]
                                )
                    except Exception as e:
                        logger_instance.error("Failed to play join TTS announcement", e)

                # Stream participant disconnected message
                if self.status == CallStatus.DISCONNECTED:
                    is_teacher = (
                        self.conf_call.state.get_teacher().phone_number
                        == participant.phone_number
                    )
                    recipients = [
                        number
                        for number in connected_numbers
                        if number != participant.phone_number
                    ]
                    try:
                        leave_text = (
                            "Teacher has left"
                            if is_teacher
                            else f"{participant.name} has left"
                        )
                        if recipients:
                            await self.conf_call.communication_api.play_announcement_to_conference(
                                leave_text, recipients
                            )
                    except Exception as e:
                        logger_instance.error(
                            "Failed to play disconnect TTS announcement", e
                        )

                await self.conf_call.update_state()
