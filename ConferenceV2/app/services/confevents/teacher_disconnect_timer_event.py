import asyncio
from datetime import datetime, timedelta
from app.models.participant import CallStatus
from app.models.system_audio_messages import SystemAudioMessages
from app.models.action_history import ActionHistory, ActionType
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.confevents.end_conf_event import EndConferenceEvent
from app.conf_logger import logger_instance
from config import get_settings

settings = get_settings()


class StartTeacherDisconnectTimerEvent(ConferenceEvent):
    """Start countdown timer when teacher disconnects"""

    def __init__(self, conf_call: ConferenceCall):
        self.conf_call = conf_call
        self.timeout_minutes = settings.AUTO_END_TIMEOUT_MINUTES

    async def execute_event(self):
        # Check if feature is enabled
        if not settings.AUTO_END_ENABLED:
            logger_instance.info(f"Auto-end disabled for {self.conf_call.conf_id}")
            return

        # Verify teacher is truly disconnected
        teacher = self.conf_call.state.get_teacher()
        if not teacher or teacher.call_status == CallStatus.CONNECTED:
            logger_instance.info(f"Teacher reconnected, not starting timer for {self.conf_call.conf_id}")
            return

        # Initialize timer state
        now = datetime.utcnow()
        expires_at = now + timedelta(minutes=self.timeout_minutes)

        self.conf_call.state.auto_end_state.is_active = True
        self.conf_call.state.auto_end_state.started_at = now.isoformat()
        self.conf_call.state.auto_end_state.expires_at = expires_at.isoformat()
        self.conf_call.state.auto_end_state.timeout_minutes = self.timeout_minutes

        # Log to action history
        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=now.isoformat(),
                action_type=ActionType.AUTO_END_TIMER_START,
                metadata={
                    "timeout_minutes": self.timeout_minutes,
                    "expires_at": expires_at.isoformat()
                },
                owner="system"
            )
        )

        # Persist to database
        await self.conf_call.update_state()

        # Play audio notification (reusing existing audio file)
        await self.conf_call.stream_system_message(
            SystemAudioMessages.TEACHER_HAS_DROPPED
        )

        logger_instance.info(
            f"Started auto-end timer for {self.conf_call.conf_id}, "
            f"expires at {expires_at.isoformat()}"
        )

        # Start background monitoring task
        asyncio.create_task(self._monitor_timer())

    async def _monitor_timer(self):
        """Background task: monitors timer and ends conference when expired"""
        while self.conf_call.state.auto_end_state.is_active:
            try:
                # Calculate time remaining
                now = datetime.utcnow()
                expires_at = datetime.fromisoformat(
                    self.conf_call.state.auto_end_state.expires_at
                )
                time_remaining = (expires_at - now).total_seconds()

                # Check if timer expired
                if time_remaining <= 0:
                    await self._handle_timer_expired()
                    break

                # Sleep until expiry time (or max 30 seconds)
                sleep_duration = min(time_remaining, 30)
                await asyncio.sleep(sleep_duration)

            except Exception as e:
                logger_instance.error(f"Error in timer monitor: {e}")
                await asyncio.sleep(30)

    async def _handle_timer_expired(self):
        """End conference when timer expires"""
        logger_instance.info(f"Auto-end timer expired for {self.conf_call.conf_id}")

        # Log expiration
        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.utcnow().isoformat(),
                action_type=ActionType.AUTO_END_TIMER_EXPIRED,
                metadata={"timeout_minutes": self.timeout_minutes},
                owner="system"
            )
        )

        # End the conference
        end_event = EndConferenceEvent(self.conf_call)
        await self.conf_call.queue_event(end_event)


class CancelTeacherDisconnectTimerEvent(ConferenceEvent):
    """Cancel countdown when teacher reconnects"""

    def __init__(self, conf_call: ConferenceCall):
        self.conf_call = conf_call

    async def execute_event(self):
        # Check if there's an active timer
        if not self.conf_call.state.auto_end_state.is_active:
            logger_instance.info(f"No active timer to cancel for {self.conf_call.conf_id}")
            return

        # Clear timer state
        self.conf_call.state.auto_end_state.is_active = False
        self.conf_call.state.auto_end_state.started_at = None
        self.conf_call.state.auto_end_state.expires_at = None

        # Log cancellation
        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.utcnow().isoformat(),
                action_type=ActionType.AUTO_END_TIMER_CANCEL,
                metadata={"reason": "teacher_reconnected"},
                owner=self.conf_call.state.teacher_phone_number
            )
        )

        # Persist updated state
        await self.conf_call.update_state()

        # Play reconnection audio (reusing existing audio file)
        await self.conf_call.stream_system_message(
            SystemAudioMessages.TEACHER_HAS_JOINED
        )

        logger_instance.info(f"Cancelled auto-end timer for {self.conf_call.conf_id}")
