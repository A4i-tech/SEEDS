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

        # Cancel existing task to prevent multiple monitors
        if hasattr(self.conf_call, '_auto_end_monitor_task'):
            if self.conf_call._auto_end_monitor_task and not self.conf_call._auto_end_monitor_task.done():
                try:
                    logger_instance.info(f"Cancelling existing monitor task for {self.conf_call.conf_id}")
                    self.conf_call._auto_end_monitor_task.cancel()
                except Exception as e:
                    logger_instance.error(f"Error cancelling monitor task: {e}")

        self.conf_call._auto_end_monitor_task = asyncio.create_task(self._monitor_timer())

    async def _monitor_timer(self):
        """Background task: only watches the clock and queues events through the event queue"""
        error_count = 0
        max_errors = 10

        while self.conf_call.state.auto_end_state.is_active:
            try:
                # Calculate time remaining
                now = datetime.utcnow()
                expires_at = datetime.fromisoformat(
                    self.conf_call.state.auto_end_state.expires_at
                )
                time_remaining = (expires_at - now).total_seconds()

                # Check if timer expired — queue event through the event queue
                if time_remaining <= 0:
                    await self.conf_call.queue_event(
                        AutoEndTimerExpiredEvent(self.conf_call, self.timeout_minutes)
                    )
                    break

                sleep_duration = min(time_remaining, 30)
                await asyncio.sleep(sleep_duration)
                error_count = 0

            except asyncio.CancelledError:
                logger_instance.info(f"Monitor task cancelled for {self.conf_call.conf_id}")
                break
            except Exception as e:
                error_count += 1
                logger_instance.error(
                    f"Error in timer monitor (attempt {error_count}/{max_errors}): {e}"
                )

                if error_count >= max_errors:
                    logger_instance.error(
                        f"Max errors reached in monitor for {self.conf_call.conf_id}, stopping timer"
                    )
                    # Queue cleanup through the event queue instead of mutating state directly
                    await self.conf_call.queue_event(
                        AutoEndTimerFailedEvent(self.conf_call)
                    )
                    break

                await asyncio.sleep(30)


class AutoEndTimerExpiredEvent(ConferenceEvent):
    """Handles timer expiry — runs inside the event queue for safe state mutation"""

    def __init__(self, conf_call: ConferenceCall, timeout_minutes: int):
        self.conf_call = conf_call
        self.timeout_minutes = timeout_minutes

    async def execute_event(self):
        # Guard: Re-check timer still active
        if not self.conf_call.state.auto_end_state.is_active:
            logger_instance.info(
                f"Timer was cancelled before expiry, not ending conference {self.conf_call.conf_id}"
            )
            return

        # Guard: Verify teacher still disconnected
        teacher = self.conf_call.state.get_teacher()
        if teacher and teacher.call_status == CallStatus.CONNECTED:
            logger_instance.info(
                f"Teacher reconnected just before expiry, not ending conference {self.conf_call.conf_id}"
            )
            self.conf_call.state.auto_end_state.is_active = False
            self.conf_call.state.auto_end_state.started_at = None
            self.conf_call.state.auto_end_state.expires_at = None
            await self.conf_call.update_state()
            return

        logger_instance.info(f"Auto-end timer expired for {self.conf_call.conf_id}")

        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.utcnow().isoformat(),
                action_type=ActionType.AUTO_END_TIMER_EXPIRED,
                metadata={"timeout_minutes": self.timeout_minutes},
                owner="system"
            )
        )

        # Mark inactive to prevent race with reconnection
        self.conf_call.state.auto_end_state.is_active = False
        self.conf_call.state.auto_end_state.started_at = None
        self.conf_call.state.auto_end_state.expires_at = None
        await self.conf_call.update_state()

        if hasattr(self.conf_call, '_auto_end_monitor_task'):
            self.conf_call._auto_end_monitor_task = None

        end_event = EndConferenceEvent(self.conf_call)
        await self.conf_call.queue_event(end_event)


class AutoEndTimerFailedEvent(ConferenceEvent):
    """Handles monitor max-errors cleanup — runs inside the event queue for safe state mutation"""

    def __init__(self, conf_call: ConferenceCall):
        self.conf_call = conf_call

    async def execute_event(self):
        self.conf_call.state.auto_end_state.is_active = False
        try:
            await self.conf_call.update_state()
        except Exception as e:
            logger_instance.error(
                f"Failed to persist timer cancellation after max errors for "
                f"{self.conf_call.conf_id}: {e}"
            )


class CancelTeacherDisconnectTimerEvent(ConferenceEvent):
    """Cancel countdown when teacher reconnects"""

    def __init__(self, conf_call: ConferenceCall):
        self.conf_call = conf_call

    async def execute_event(self):
        if not self.conf_call.state.auto_end_state.is_active:
            logger_instance.info(f"No active timer to cancel for {self.conf_call.conf_id}")
            return

        self.conf_call.state.auto_end_state.is_active = False
        self.conf_call.state.auto_end_state.started_at = None
        self.conf_call.state.auto_end_state.expires_at = None

        if hasattr(self.conf_call, '_auto_end_monitor_task'):
            if self.conf_call._auto_end_monitor_task and not self.conf_call._auto_end_monitor_task.done():
                try:
                    logger_instance.info(f"Cancelling monitor task for {self.conf_call.conf_id}")
                    self.conf_call._auto_end_monitor_task.cancel()
                except Exception as e:
                    logger_instance.error(f"Error cancelling monitor task: {e}")

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
