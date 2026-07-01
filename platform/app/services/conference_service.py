"""
Conference service — core conference lifecycle management.

Ported from ConferenceV2 services/conference_call.py and
services/singletons/conference_call_manager.py.

Responsibilities:
  - ConferenceCall: per-conference runtime object (event queue, state, audio relay)
  - ConferenceCallManager: singleton registry of active conferences

SECURITY:
  - Phone numbers are treated as PII; only masked in DEBUG logs.
  - Audio data paths never appear in INFO+ logs.
"""

from __future__ import annotations

import asyncio
import logging
import traceback
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from fastapi import Depends, WebSocket
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.action_history import ActionHistory, ActionType
from app.models.conference_state import ConferenceCallState
from app.models.participant import CallStatus, Participant, Role
from app.platform.auth.dependencies import get_db
from app.platform.settings import get_settings
from app.services.confevents.base_event import ConferenceEvent

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ConferenceCall — runtime object for a single conference
# ---------------------------------------------------------------------------


class ConferenceCall:
    """Runtime object for a single active conference call.

    Holds:
      - ``state``: serialisable ``ConferenceCallState``
      - ``communication_api``: VonageAPIProvider instance
      - ``connection_manager``: SmartphoneConnectionManager instance
      - An asyncio event queue processed by a background task
    """

    def __init__(
        self,
        conf_id: str,
        communication_api: Any,
        connection_manager: Any,
        storage_manager: Any,
    ) -> None:
        self.conf_id = conf_id
        self.communication_api = communication_api
        self.connection_manager = connection_manager
        self.storage_manager = storage_manager
        self.redis_store: Any = None
        self.state = ConferenceCallState()

        self.event_queue: asyncio.Queue[ConferenceEvent] = asyncio.Queue()
        self.event_queue_processing_task: asyncio.Task[None] | None = None

        # Remote audio relay (websocket-service → hold detection)
        self._remote_audio_queue: asyncio.Queue[bytes] | None = None
        self._remote_audio_task: asyncio.Task[None] | None = None
        self._capture_session: Any = None
        self._capture_finalize_task: asyncio.Task[str | None] | None = None
        self._websocket: WebSocket | None = None
        self._hold_transcript_window: Any = None

    # ------------------------------------------------------------------
    # Participant state initialisation
    # ------------------------------------------------------------------

    def set_participant_state(
        self,
        teacher_phone: str,
        student_phones: list[str],
        leader_phone: str | None = None,
        teacher_name: str | None = None,
        student_names: list[str] | None = None,
    ) -> None:
        self.state.participants = {}
        teacher = Participant(
            name=teacher_name or "Teacher",
            phone_number=teacher_phone,
            role=Role.TEACHER,
            call_status=CallStatus.DISCONNECTED,
        )
        self.state.participants[teacher_phone] = teacher
        self.state.teacher_phone_number = teacher_phone

        if leader_phone and leader_phone not in student_phones:
            logger.warning("leader_phone is not in student_phones — ignoring")
            leader_phone = None
        self.state.leader_phone_number = leader_phone

        for idx, phone in enumerate(student_phones):
            name = (student_names[idx] if student_names and idx < len(student_names) else None)
            student = Participant(
                name=name or "Student",
                phone_number=phone,
                role=Role.STUDENT,
                call_status=CallStatus.DISCONNECTED,
                is_muted=True,
            )
            self.state.participants[phone] = student

    # ------------------------------------------------------------------
    # Event queue
    # ------------------------------------------------------------------

    async def queue_event(self, event: ConferenceEvent) -> None:
        await self.event_queue.put(event)

    def start_processing_conf_events_from_queue(self) -> None:
        self.end_processing_conf_events_from_queue()
        self.event_queue_processing_task = asyncio.create_task(
            self._process_conf_events_queue()
        )

    def end_processing_conf_events_from_queue(self) -> None:
        if self.event_queue_processing_task is not None:
            self.event_queue_processing_task.cancel()

    def is_queue_processing(self) -> bool:
        return (
            self.event_queue_processing_task is not None
            and not self.event_queue_processing_task.done()
        )

    async def _process_conf_events_queue(self, timeout: float = 15.0) -> None:
        while True:
            event = await self.event_queue.get()
            try:
                await asyncio.wait_for(event.execute_event(), timeout=timeout)
            except TimeoutError:
                logger.warning("conference_service: event %s timed out", type(event).__name__)
            except Exception as exc:
                logger.error("conference_service: event %s error — %s", type(event).__name__, exc)
                logger.debug("conference_service: traceback:\n%s", traceback.format_exc())
            finally:
                self.event_queue.task_done()

    # ------------------------------------------------------------------
    # System message streaming
    # ------------------------------------------------------------------

    async def stream_system_message(self, message: Any) -> None:
        """Stream a system audio message via the websocket-service."""
        if self.state.is_running and self.communication_api.get_is_websocket_connected():
            try:
                from app.models.ws_service_message import (  # noqa: PLC0415
                    MessageType,
                    WebsocketServiceMessage,
                )
                from app.providers.websocket_client import WebsocketClientProvider  # noqa: PLC0415

                ws = WebsocketClientProvider()
                await ws.send_message(WebsocketServiceMessage(
                    websocket_id=self.conf_id,
                    type=MessageType.PLAY_SYSTEM_MESSAGE,
                    message=message.value if hasattr(message, "value") else str(message),
                ))
            except Exception as exc:
                logger.warning("conference_service: stream_system_message failed — %s", exc)

    # ------------------------------------------------------------------
    # WebSocket (inbound audio from Vonage)
    # ------------------------------------------------------------------

    def set_websocket(self, websocket: WebSocket | None) -> None:
        self._websocket = websocket

    async def close_websocket(self) -> None:
        if self._websocket:
            try:
                await self._websocket.close()
            except Exception:
                pass
            finally:
                self._websocket = None

    # ------------------------------------------------------------------
    # Remote audio relay
    # ------------------------------------------------------------------

    def start_remote_audio_relay(self) -> None:

        settings = get_settings()
        if not (settings.audio_analysis_enabled or settings.audio_capture_enabled):
            logger.info("conference_service: audio relay disabled for %s", self.conf_id)
            return
        self.stop_remote_audio_relay()
        self._remote_audio_queue = asyncio.Queue(maxsize=settings.audio_relay_max_queue)
        self._remote_audio_task = asyncio.create_task(self._consume_remote_audio())

    def stop_remote_audio_relay(self) -> None:
        if self._remote_audio_task is not None:
            self._remote_audio_task.cancel()
            self._remote_audio_task = None
        self._remote_audio_queue = None

    async def _consume_remote_audio(self) -> None:
        from app.services.audio.audio_capture import AudioCaptureService  # noqa: PLC0415
        from app.services.audio.hold_detector import HoldDetector  # noqa: PLC0415
        from app.services.audio.transcriber import AudioTranscriber  # noqa: PLC0415
        from app.services.audio.websocket_audio_processor import (
            process_audio_message,  # noqa: PLC0415
        )

        settings = get_settings()
        transcriber: AudioTranscriber | None = None
        hold_detector: HoldDetector | None = None

        if settings.audio_capture_enabled and self._capture_session is None:
            try:
                self._capture_session = AudioCaptureService(self.conf_id, settings=settings)
            except Exception as exc:
                logger.error("conference_service: audio capture init failed — %s", exc)

        if settings.audio_analysis_enabled:
            try:
                transcriber = AudioTranscriber()
                hold_detector = await HoldDetector.create()
            except Exception as exc:
                logger.error("conference_service: audio analysis init failed — %s", exc)

        if self._capture_session is None and (transcriber is None or hold_detector is None):
            logger.warning("conference_service: remote audio relay disabled — init failed")
            return

        try:
            while True:
                audio_bytes = await self._remote_audio_queue.get()  # type: ignore[union-attr]
                if self._capture_session:
                    try:
                        self._capture_session.write_chunk(audio_bytes)
                    except Exception as exc:
                        logger.exception("conference_service: capture write error — %s", exc)
                if transcriber and hold_detector:
                    await process_audio_message(
                        audio_bytes, self, transcriber, hold_detector,
                        self.conf_id, self._capture_session,
                    )
        except asyncio.CancelledError:
            logger.info("conference_service: remote audio relay stopped for %s", self.conf_id)
        except Exception as exc:
            logger.exception("conference_service: remote audio relay error — %s", exc)

    def schedule_capture_finalize(self) -> asyncio.Task[str | None] | None:
        if self._capture_finalize_task is not None and not self._capture_finalize_task.done():
            return self._capture_finalize_task
        if self._capture_session is None:
            return None
        self._capture_finalize_task = asyncio.create_task(self.finalize_capture_session())
        self._capture_finalize_task.add_done_callback(self._log_capture_finalize_result)
        return self._capture_finalize_task

    def _log_capture_finalize_result(self, task: asyncio.Task[str | None]) -> None:
        try:
            task.result()
        except Exception:
            logger.exception("conference_service: capture finalize failed for %s", self.conf_id)

    async def finalize_capture_session(self) -> str | None:
        if self._capture_session is None:
            return None
        session = self._capture_session
        self._capture_session = None
        try:
            url = await session.finalize()
            if url:
                logger.info("conference_service: audio uploaded for %s", self.conf_id)
            return url
        except Exception as exc:
            logger.exception("conference_service: finalize error for %s — %s", self.conf_id, exc)
            return None

    # ------------------------------------------------------------------
    # Auto-end timer restore
    # ------------------------------------------------------------------

    def restore_auto_end_timer(self) -> None:
        if self.state.auto_end_state.is_active:
            from app.services.confevents.teacher_disconnect_timer_event import (  # noqa: PLC0415
                StartTeacherDisconnectTimerEvent,
            )

            logger.info(
                "conference_service: restoring auto-end timer for %s, expires %s",
                self.conf_id, self.state.auto_end_state.expires_at,
            )
            timer_event = StartTeacherDisconnectTimerEvent(self)
            if hasattr(self, "_auto_end_monitor_task") and self._auto_end_monitor_task and not self._auto_end_monitor_task.done():
                self._auto_end_monitor_task.cancel()
            self._auto_end_monitor_task = asyncio.create_task(timer_event._monitor_timer())

    # ------------------------------------------------------------------
    # Conference lifecycle
    # ------------------------------------------------------------------

    async def start_conference(self) -> None:
        await self.communication_api.start_conf(
            self.state.teacher_phone_number,
            [s.phone_number for s in self.state.get_students()],
        )
        self.state.is_running = True
        self.state.hold_detected = False
        self.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.CONFERENCE_START,
                metadata={
                    "teacher_phone": self.state.teacher_phone_number,
                    "student_phones": [s.phone_number for s in self.state.get_students()],
                },
                owner=self.state.teacher_phone_number or "",
            )
        )
        await self.update_state()
        self.restore_auto_end_timer()

    async def connect_smartphone(self) -> Any:
        teacher = self.state.get_teacher()
        if teacher:
            return await self.connection_manager.connect(client=teacher)
        raise ValueError(f"No teacher in conference {self.conf_id}")

    async def disconnect_smartphone(self) -> Any:
        teacher = self.state.get_teacher()
        if teacher:
            return await self.connection_manager.disconnect(client=teacher)
        raise ValueError(f"No teacher in conference {self.conf_id}")

    async def update_state(self) -> None:
        if self.storage_manager is not None:
            await self.storage_manager.save_state(
                self.conf_id, self.state.model_dump(by_alias=True)
            )
        if self.redis_store is not None:
            await self.redis_store.save(self.conf_id, self.state)
        if self.connection_manager is not None:
            await self.connection_manager.send_message_to_client(
                client=self.state.get_teacher(),
                message=self.state.model_dump(by_alias=True),
            )

    async def on_websocket_disconnect_callback(self) -> None:
        await self.communication_api.reconnect_websocket()


# ---------------------------------------------------------------------------
# ConferenceCallManager — singleton registry
# ---------------------------------------------------------------------------


class ConferenceCallManager:
    """Registry of active ConferenceCall instances.

    One instance is created at startup (see lifespan) and injected via
    FastAPI dependency or direct import.
    """

    def __init__(
        self,
        communication_api_factory: Any,
        connection_manager_factory: Any,
        storage_manager: Any,
        ws_base_url: str = "",
    ) -> None:
        self._communication_api_factory = communication_api_factory
        self._connection_manager_factory = connection_manager_factory
        self._storage_manager = storage_manager
        self._ws_base_url = ws_base_url
        self._conferences: dict[str, ConferenceCall] = {}
        self._redis_store: Any = None

    # ------------------------------------------------------------------
    # Redis helpers
    # ------------------------------------------------------------------

    def _get_redis(self) -> Any:
        if self._redis_store is None:
            from app.services.redis_conference_store import RedisConferenceStore  # noqa: PLC0415

            self._redis_store = RedisConferenceStore()
        return self._redis_store

    def _attach_redis(self, conf: ConferenceCall) -> None:
        store = self._get_redis()
        conf.redis_store = store
        if hasattr(conf.communication_api, "redis_store"):
            conf.communication_api.redis_store = store

    # ------------------------------------------------------------------
    # Conference factory
    # ------------------------------------------------------------------

    def _build_conference_call(self, conf_id: str) -> ConferenceCall:
        ws_url = f"{self._ws_base_url}?id={conf_id}"
        comm_api = self._communication_api_factory.create(conf_id=conf_id, ws_url=ws_url)
        conn_mgr = self._connection_manager_factory.create(conf_id=conf_id)
        conf = ConferenceCall(
            conf_id=conf_id,
            communication_api=comm_api,
            connection_manager=conn_mgr,
            storage_manager=self._storage_manager,
        )
        self._attach_redis(conf)
        return conf

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def create_conference(
        self,
        teacher_phone: str,
        student_phones: list[str],
        leader_phone: str | None = None,
        teacher_name: str | None = None,
        student_names: list[str] | None = None,
    ) -> ConferenceCall:
        conf_id = str(uuid.uuid4())
        conf = self._build_conference_call(conf_id)
        conf.set_participant_state(teacher_phone, student_phones, leader_phone, teacher_name, student_names)
        conf.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.CONFERENCE_CREATED,
                metadata={"teacher_phone": teacher_phone, "student_phones": student_phones},
                owner=teacher_phone,
            )
        )
        self._conferences[conf_id] = conf
        await conf.update_state()
        return conf

    async def start_conference_call(self, conf_id: str) -> None:
        conf = self.get_conference(conf_id)
        if not conf:
            raise ValueError(f"No such conference: {conf_id}")
        conf.start_processing_conf_events_from_queue()
        conf.start_remote_audio_relay()
        conf.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.CONFERENCE_START_REQUESTED,
                metadata={
                    "teacher_phone": conf.state.teacher_phone_number,
                    "student_phones": [s.phone_number for s in conf.state.get_students()],
                },
                owner=conf.state.teacher_phone_number or "",
            )
        )
        try:
            await conf.update_state()
            await conf.start_conference()
        except Exception as exc:
            conf.end_processing_conf_events_from_queue()
            conf.stop_remote_audio_relay()
            conf.state.action_history.append(
                ActionHistory(
                    timestamp=datetime.now().isoformat(),
                    action_type=ActionType.CONFERENCE_START_FAILED,
                    metadata={"error": type(exc).__name__, "detail": str(exc)},
                    owner=conf.state.teacher_phone_number or "",
                )
            )
            try:
                await conf.update_state()
            except Exception:
                logger.error("conference_service: failed to persist CONFERENCE_START_FAILED", exc_info=True)
            raise

    def get_conference(self, conf_id: str) -> ConferenceCall | None:
        return self._conferences.get(conf_id)

    def delete_conference(self, conf_id: str) -> None:
        self._conferences.pop(conf_id, None)
        asyncio.create_task(self._get_redis().delete(conf_id))

    def get_conference_from_phone_number(self, phone_number: str) -> ConferenceCall | None:
        for conf in self._conferences.values():
            if phone_number in conf.state.participants:
                return conf
        return None

    async def restore_from_redis(self) -> None:
        store = self._get_redis()
        conf_ids = await store.list_active()
        for conf_id in conf_ids:
            if conf_id in self._conferences:
                continue
            state = await store.load(conf_id)
            if state is None:
                continue
            conf = self._build_conference_call(conf_id)
            conf.state = state
            comm = conf.communication_api
            if hasattr(comm, "teacher_phone_number"):
                comm.teacher_phone_number = state.teacher_phone_number
            participants = await store.get_all_participants(conf_id)
            conv_id = next(
                (p.conference_conv_id for p in participants.values() if p.conference_conv_id),
                None,
            )
            if conv_id and hasattr(comm, "vonage_conv_id"):
                comm.vonage_conv_id = conv_id
            self._conferences[conf_id] = conf
            if state.is_running:
                conf.start_processing_conf_events_from_queue()
                conf.start_remote_audio_relay()
                conf.restore_auto_end_timer()
                logger.info("conference_service: restored running conference %s", conf_id)
            else:
                logger.info("conference_service: restored idle conference %s", conf_id)

    async def close(self) -> None:
        if self._redis_store is not None:
            await self._redis_store.close()


# ---------------------------------------------------------------------------
# Conference ownership service — thin wrapper for DI
# ---------------------------------------------------------------------------


class ConferenceOwnershipService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:  # type: ignore[type-arg]
        from app.repositories.conference_repository import (
            ConferenceOwnershipRepository,  # noqa: PLC0415
        )
        self._repo = ConferenceOwnershipRepository(db)

    async def record_ownership(
        self,
        conf_id: str,
        created_by: str,
        tenant_id: str,
        teacher_phone: str,
    ) -> None:
        await self._repo.create(
            conf_id=conf_id,
            created_by=created_by,
            tenant_id=tenant_id,
            teacher_phone=teacher_phone,
        )


def get_conference_ownership_service(
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> ConferenceOwnershipService:
    return ConferenceOwnershipService(db)
