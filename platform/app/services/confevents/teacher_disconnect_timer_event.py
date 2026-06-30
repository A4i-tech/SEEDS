"""Teacher disconnect timer events — auto-end conference if teacher stays disconnected."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from app.models.action_history import ActionHistory, ActionType
from app.models.participant import CallStatus
from app.models.system_audio_messages import SystemAudioMessages
from app.platform.settings import get_settings
from app.services.confevents.base_event import ConferenceEvent

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall
logger = logging.getLogger(__name__)


class StartTeacherDisconnectTimerEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall) -> None:
        self.conf_call = conf_call
        settings = get_settings()
        self.timeout_minutes = settings.auto_end_timeout_minutes
        self.auto_end_enabled = settings.auto_end_enabled

    async def execute_event(self) -> None:
        if not self.auto_end_enabled:
            return
        teacher = self.conf_call.state.get_teacher()
        if not teacher or teacher.call_status == CallStatus.CONNECTED:
            return
        now = datetime.utcnow()
        expires_at = now + timedelta(minutes=self.timeout_minutes)
        self.conf_call.state.auto_end_state.is_active = True
        self.conf_call.state.auto_end_state.started_at = now.isoformat()
        self.conf_call.state.auto_end_state.expires_at = expires_at.isoformat()
        self.conf_call.state.auto_end_state.timeout_minutes = self.timeout_minutes
        self.conf_call.state.action_history.append(ActionHistory(timestamp=now.isoformat(), action_type=ActionType.AUTO_END_TIMER_START, metadata={"timeout_minutes": self.timeout_minutes, "expires_at": expires_at.isoformat()}, owner="system"))
        await self.conf_call.update_state()
        if hasattr(self.conf_call, "_auto_end_monitor_task") and self.conf_call._auto_end_monitor_task and not self.conf_call._auto_end_monitor_task.done():
            self.conf_call._auto_end_monitor_task.cancel()
        self.conf_call._auto_end_monitor_task = asyncio.create_task(self._monitor_timer())

    async def _monitor_timer(self) -> None:
        error_count = 0
        while self.conf_call.state.auto_end_state.is_active:
            try:
                now = datetime.utcnow()
                expires_at = datetime.fromisoformat(self.conf_call.state.auto_end_state.expires_at)
                remaining = (expires_at - now).total_seconds()
                if remaining <= 0:
                    await self.conf_call.queue_event(AutoEndTimerExpiredEvent(self.conf_call, self.timeout_minutes))
                    break
                await asyncio.sleep(min(remaining, 30))
                error_count = 0
            except asyncio.CancelledError:
                break
            except Exception as exc:
                error_count += 1
                logger.error("timer_monitor: error %d/10 — %s", error_count, exc)
                if error_count >= 10:
                    await self.conf_call.queue_event(AutoEndTimerFailedEvent(self.conf_call))
                    break
                await asyncio.sleep(30)


class AutoEndTimerExpiredEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall, timeout_minutes: int) -> None:
        self.conf_call = conf_call
        self.timeout_minutes = timeout_minutes

    async def execute_event(self) -> None:
        if not self.conf_call.state.auto_end_state.is_active:
            return
        teacher = self.conf_call.state.get_teacher()
        if teacher and teacher.call_status == CallStatus.CONNECTED:
            self.conf_call.state.auto_end_state.is_active = False
            self.conf_call.state.auto_end_state.started_at = None
            self.conf_call.state.auto_end_state.expires_at = None
            await self.conf_call.update_state()
            return
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.utcnow().isoformat(), action_type=ActionType.AUTO_END_TIMER_EXPIRED, metadata={"timeout_minutes": self.timeout_minutes}, owner="system"))
        self.conf_call.state.auto_end_state.is_active = False
        self.conf_call.state.auto_end_state.started_at = None
        self.conf_call.state.auto_end_state.expires_at = None
        await self.conf_call.update_state()
        from app.services.confevents.end_conf_event import EndConferenceEvent  # noqa: PLC0415
        await self.conf_call.queue_event(EndConferenceEvent(self.conf_call))


class AutoEndTimerFailedEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall) -> None:
        self.conf_call = conf_call

    async def execute_event(self) -> None:
        self.conf_call.state.auto_end_state.is_active = False
        try:
            await self.conf_call.update_state()
        except Exception as exc:
            logger.error("auto_end_timer_failed: persist error — %s", exc)


class CancelTeacherDisconnectTimerEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall) -> None:
        self.conf_call = conf_call

    async def execute_event(self) -> None:
        if not self.conf_call.state.auto_end_state.is_active:
            return
        self.conf_call.state.auto_end_state.is_active = False
        self.conf_call.state.auto_end_state.started_at = None
        self.conf_call.state.auto_end_state.expires_at = None
        if hasattr(self.conf_call, "_auto_end_monitor_task") and self.conf_call._auto_end_monitor_task and not self.conf_call._auto_end_monitor_task.done():
            self.conf_call._auto_end_monitor_task.cancel()
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.utcnow().isoformat(), action_type=ActionType.AUTO_END_TIMER_CANCEL, metadata={"reason": "teacher_reconnected"}, owner=self.conf_call.state.teacher_phone_number or ""))
        await self.conf_call.update_state()
        await self.conf_call.stream_system_message(SystemAudioMessages.TEACHER_HAS_JOINED)
