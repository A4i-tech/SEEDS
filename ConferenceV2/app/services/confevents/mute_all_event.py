from datetime import datetime
from typing import Optional
from app.models.action_history import ActionHistory, ActionType
from app.models.system_audio_messages import SystemAudioMessages
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.confevents.mute_participant_event import MuteParticipantEvent
from app.conf_logger import logger_instance
from app.services.caller_state_manager import caller_state_manager
import asyncio


class MuteAllEvent(ConferenceEvent):
    """
    Event to mute all student participants in a conference.
    Only applies to students, not the teacher.
    """

    def __init__(self, conf_call: ConferenceCall, stream_system_message: bool = True, initiator_phone: Optional[str] = None):
        self.conf_call = conf_call
        self.stream_system_message = stream_system_message
        self.initiator_phone = initiator_phone

    async def execute_event(self):
        logger_instance.info("EXECUTING MUTE ALL EVENT", self.conf_call.conf_id)

        teacher = self.conf_call.state.get_teacher()
        if not teacher:
            logger_instance.error(
                "No teacher found in conference", self.conf_call.conf_id
            )
            return

        students = self.conf_call.state.get_students()
        muted_count = 0
        failed_phones = []

        # Mute all students in parallel for better performance
        mute_tasks = []
        student_phones = []
        for student in students:
            if student.phone_number in self.conf_call.state.participants:
                # Skip if already muted
                if not student.is_muted:
                    mute_tasks.append(self._mute_student(student.phone_number))
                    student_phones.append(student.phone_number)

        if mute_tasks:
            results = await asyncio.gather(*mute_tasks, return_exceptions=True)

            # Process results
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    student_phone = (
                        student_phones[i] if i < len(student_phones) else "unknown"
                    )
                    logger_instance.error(
                        f"Failed to mute student {student_phone}: {result}"
                    )
                    failed_phones.append(student_phone)
                elif result:
                    muted_count += 1

            # Stream system message once for all students (not per student)
            if self.stream_system_message and muted_count > 0:
                await self.conf_call.stream_system_message(
                    SystemAudioMessages.STUDENT_IS_MUTED
                )

        # Log the action in the action history
        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.LEADER_MUTE_ALL_VIA_DTMF if self.initiator_phone else ActionType.TEACHER_MUTE_ALL,
                metadata={
                    "muted_count": muted_count,
                    "total_students": len(students),
                    "failed_phones": failed_phones,
                },
                owner=self.initiator_phone or self.conf_call.state.teacher_phone_number,
            )
        )

        # Update the conference call state (this will trigger SSE notifications)
        await self.conf_call.update_state()

        logger_instance.info(
            f"MUTE ALL completed: {muted_count} students muted", self.conf_call.conf_id
        )

    async def _mute_student(self, phone_number: str) -> bool:
        """Helper method to mute a single student."""
        try:
            mute_event = MuteParticipantEvent(
                phone_number=phone_number,
                conf_call=self.conf_call,
                stream_system_message=False,
            )
            await mute_event.execute_event()
            return True
        except Exception as e:
            logger_instance.error(f"Error muting student {phone_number}: {e}")
            raise
