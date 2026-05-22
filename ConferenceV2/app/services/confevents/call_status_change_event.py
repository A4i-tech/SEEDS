from app.models.participant import CallStatus, Participant
from app.models.system_audio_messages import SystemAudioMessages
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.confevents.teacher_disconnect_timer_event import (
    StartTeacherDisconnectTimerEvent,
    CancelTeacherDisconnectTimerEvent
)
from app.conf_logger import logger_instance
from app.services.singletons.conference_call_manager import conference_manager


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

                # Check if this is the teacher
                is_teacher = (
                    self.conf_call.state.get_teacher() and
                    self.conf_call.state.get_teacher().phone_number == participant.phone_number
                )

                connected_numbers = [
                    number
                    for number, current_participant in self.conf_call.state.participants.items()
                    if current_participant.call_status == CallStatus.CONNECTED
                ]

                if self.status == CallStatus.CONNECTED:
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
                                    "Teacher is in the conference", [participant.phone_number]
                                )
                    except Exception as e:
                        logger_instance.error("Failed to play join TTS announcement", e)

                    # Teacher reconnected → cancel auto-end timer
                    if is_teacher:
                        logger_instance.info(f"Teacher reconnected to {self.conf_call.conf_id}")
                        if self.conf_call.state.auto_end_state.is_active:
                            cancel_event = CancelTeacherDisconnectTimerEvent(self.conf_call)
                            await self.conf_call.queue_event(cancel_event)

                # Stream participant disconnected message
                if self.status == CallStatus.DISCONNECTED:
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

                    # Teacher disconnected → play system audio and start auto-end timer
                    if is_teacher:
                        logger_instance.info(f"Teacher disconnected from {self.conf_call.conf_id}")
                        await self.conf_call.stream_system_message(
                            SystemAudioMessages.TEACHER_HAS_DROPPED
                        )
                        timer_event = StartTeacherDisconnectTimerEvent(self.conf_call)
                        await self.conf_call.queue_event(timer_event)

                await self.conf_call.update_state()

                # Condition-based cleanup: if conference was started, has ended,
                # and all participants are now disconnected, free it from memory.
                if self.conf_call._has_started and not self.conf_call.state.is_running:
                    all_disconnected = all(
                        p.call_status == CallStatus.DISCONNECTED
                        for p in self.conf_call.state.participants.values()
                    )
                    if all_disconnected:
                        logger_instance.info(
                            f"All participants disconnected for ended conference "
                            f"{self.conf_call.conf_id} — cleaning up from memory"
                        )
                        self.conf_call.end_processing_conf_events_from_queue()
                        try:
                            conference_manager.delete_conference(self.conf_call.conf_id)
                        except KeyError:
                            pass
