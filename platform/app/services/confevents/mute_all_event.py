"""Mute all students event."""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from app.models.action_history import ActionHistory, ActionType
from app.models.system_audio_messages import SystemAudioMessages
from app.services.confevents.base_event import ConferenceEvent
if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall
logger = logging.getLogger(__name__)

class MuteAllEvent(ConferenceEvent):
    def __init__(self, conf_call: "ConferenceCall", stream_system_message: bool = True, initiator_phone: Optional[str] = None) -> None:
        self.conf_call = conf_call
        self.stream_system_message = stream_system_message
        self.initiator_phone = initiator_phone

    async def execute_event(self) -> None:
        teacher = self.conf_call.state.get_teacher()
        if not teacher:
            return
        from app.services.confevents.mute_participant_event import MuteParticipantEvent  # noqa: PLC0415
        students = self.conf_call.state.get_students()
        tasks = [self._mute_student(s.phone_number) for s in students if not s.is_muted]
        phone_list = [s.phone_number for s in students if not s.is_muted]
        muted_count = 0
        failed_phones: list[str] = []
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for i, res in enumerate(results):
                if isinstance(res, Exception):
                    failed_phones.append(phone_list[i] if i < len(phone_list) else "unknown")
                elif res:
                    muted_count += 1
            if self.stream_system_message and muted_count > 0:
                await self.conf_call.stream_system_message(SystemAudioMessages.STUDENT_IS_MUTED)
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.LEADER_MUTE_ALL_VIA_DTMF if self.initiator_phone else ActionType.TEACHER_MUTE_ALL, metadata={"muted_count": muted_count, "total_students": len(students), "failed_phones": failed_phones}, owner=self.initiator_phone or self.conf_call.state.teacher_phone_number or ""))
        await self.conf_call.update_state()

    async def _mute_student(self, phone_number: str) -> bool:
        from app.services.confevents.mute_participant_event import MuteParticipantEvent  # noqa: PLC0415
        await MuteParticipantEvent(phone_number=phone_number, conf_call=self.conf_call, stream_system_message=False).execute_event()
        return True
