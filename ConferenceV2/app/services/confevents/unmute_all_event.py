from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.system_audio_messages import SystemAudioMessages
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.confevents.unmute_participant_event import UnmuteParticipantEvent
from app.conf_logger import logger_instance
import asyncio


class UnmuteAllEvent(ConferenceEvent):
    """
    Event to unmute all student participants in a conference.
    Only applies to students, not the teacher.
    """

    def __init__(self, conf_call: ConferenceCall, stream_system_message: bool = True):
        self.conf_call = conf_call
        self.stream_system_message = stream_system_message

    async def execute_event(self):
        logger_instance.info("EXECUTING UNMUTE ALL EVENT", self.conf_call.conf_id)

        teacher = self.conf_call.state.get_teacher()
        if not teacher:
            logger_instance.error(
                "No teacher found in conference", self.conf_call.conf_id
            )
            return

        students = self.conf_call.state.get_students()
        unmuted_count = 0
        failed_phones = []

        # Unmute all students in parallel for better performance
        unmute_tasks = []
        student_phones = []
        for student in students:
            if student.phone_number in self.conf_call.state.participants:
                # Skip if already unmuted
                if student.is_muted:
                    unmute_tasks.append(self._unmute_student(student.phone_number))
                    student_phones.append(student.phone_number)

        if unmute_tasks:
            results = await asyncio.gather(*unmute_tasks, return_exceptions=True)

            # Process results
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    student_phone = (
                        student_phones[i] if i < len(student_phones) else "unknown"
                    )
                    logger_instance.error(
                        f"Failed to unmute student {student_phone}: {result}"
                    )
                    failed_phones.append(student_phone)
                elif result:
                    unmuted_count += 1

            # Stream system message once for all students (not per student)
            if self.stream_system_message and unmuted_count > 0:
                await self.conf_call.stream_system_message(
                    SystemAudioMessages.STUDENT_IS_UNMUTED
                )

        # Log the action in the action history
        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.TEACHER_UNMUTE_ALL,
                metadata={
                    "unmuted_count": unmuted_count,
                    "total_students": len(students),
                    "failed_phones": failed_phones,
                },
                owner=self.conf_call.state.teacher_phone_number,
            )
        )

        # Update the conference call state (this will trigger SSE notifications)
        await self.conf_call.update_state()

        logger_instance.info(
            f"UNMUTE ALL completed: {unmuted_count} students unmuted",
            self.conf_call.conf_id,
        )

    async def _unmute_student(self, phone_number: str) -> bool:
        """Helper method to unmute a single student using UnmuteParticipantEvent."""
        try:
            unmute_event = UnmuteParticipantEvent(
                phone_number=phone_number,
                conf_call=self.conf_call,
                stream_system_message=False,
            )
            await unmute_event.execute_event()
            return True
        except Exception as e:
            logger_instance.error(f"Error unmuting student {phone_number}: {e}")
            raise
