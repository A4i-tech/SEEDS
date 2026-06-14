"""DTMF input event — handles student hand-raise and leader control digits."""
from __future__ import annotations
import logging
from datetime import datetime
from typing import TYPE_CHECKING
from app.models.action_history import ActionHistory, ActionType
from app.models.participant import Role, Participant
from app.models.playback_state import ContentStatus
from app.models.system_audio_messages import SystemAudioMessages
from app.services.confevents.base_event import ConferenceEvent
if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall
logger = logging.getLogger(__name__)

CONTENT_ACTIVE_STATUSES = (ContentStatus.PLAYING, ContentStatus.STARTING, ContentStatus.PAUSED)

class DTMFInputEvent(ConferenceEvent):
    def __init__(self, phone_number: str, digit: str, conf_call: "ConferenceCall") -> None:
        self.phone_number = phone_number
        self.digit = digit
        self.conf_call = conf_call

    async def execute_event(self) -> None:
        if self.phone_number not in self.conf_call.state.participants:
            return
        participant: Participant = self.conf_call.state.participants[self.phone_number]
        leader_phone = self.conf_call.state.leader_phone_number

        if participant.role == Role.STUDENT and self.digit == "0" and not participant.is_raised:
            participant.is_raised = True
            participant.raised_at = int(datetime.now().timestamp())
            await self.conf_call.stream_system_message(SystemAudioMessages.STUDENT_HAS_RAISED_HAND)
            self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.STUDENT_RAISE_HAND_STATE_CHANGE, metadata={"phone_number": participant.phone_number, "raised_hand": True, "raised_at": participant.raised_at}, owner=participant.phone_number))
            await self.conf_call.update_state()

        elif leader_phone and self.phone_number == leader_phone:
            from app.services.confevents.mute_all_event import MuteAllEvent  # noqa: PLC0415
            from app.services.confevents.unmute_all_event import UnmuteAllEvent  # noqa: PLC0415
            from app.services.confevents.pause_content_event import PauseContentEvent  # noqa: PLC0415
            from app.services.confevents.resume_content_event import ResumeContentEvent  # noqa: PLC0415
            from app.services.confevents.seek_content_event import SeekContentEvent  # noqa: PLC0415
            from app.services.confevents.set_playback_speed_event import SetPlaybackSpeedEvent  # noqa: PLC0415
            audio_state = self.conf_call.state.audio_content_state
            if self.digit == "1":
                await MuteAllEvent(conf_call=self.conf_call, initiator_phone=self.phone_number).execute_event()
            elif self.digit == "3":
                await UnmuteAllEvent(conf_call=self.conf_call, initiator_phone=self.phone_number).execute_event()
            elif self.digit == "6":
                if audio_state.status not in CONTENT_ACTIVE_STATUSES:
                    return
                if audio_state.status in (ContentStatus.PLAYING, ContentStatus.STARTING):
                    await PauseContentEvent(conf_call=self.conf_call, initiator_phone=self.phone_number).execute_event()
                else:
                    await ResumeContentEvent(conf_call=self.conf_call, initiator_phone=self.phone_number).execute_event()
            elif self.digit == "7":
                if audio_state.status not in CONTENT_ACTIVE_STATUSES:
                    return
                await SeekContentEvent(conf_call=self.conf_call, delta_seconds=-10, initiator_phone=self.phone_number).execute_event()
            elif self.digit == "9":
                if audio_state.status not in CONTENT_ACTIVE_STATUSES:
                    return
                await SeekContentEvent(conf_call=self.conf_call, delta_seconds=10, initiator_phone=self.phone_number).execute_event()
            elif self.digit == "*":
                if audio_state.status not in CONTENT_ACTIVE_STATUSES:
                    return
                await SetPlaybackSpeedEvent(conf_call=self.conf_call, speed=max(0.5, round(audio_state.speed - 0.25, 2)), initiator_phone=self.phone_number).execute_event()
            elif self.digit == "#":
                if audio_state.status not in CONTENT_ACTIVE_STATUSES:
                    return
                await SetPlaybackSpeedEvent(conf_call=self.conf_call, speed=min(2.0, round(audio_state.speed + 0.25, 2)), initiator_phone=self.phone_number).execute_event()
