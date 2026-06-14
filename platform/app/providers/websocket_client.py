"""
WebSocket client provider — control channel to websocket-service.

Ported from ConferenceV2 app/services/singletons/websocket_service.py.

SECURITY:
  - WS_CONTROL_SECRET (Phase 11) will be enforced here via Authorization header.
  - Connection URL is not logged at INFO level to avoid leaking service topology.
  - Message payloads are redacted unless DEBUG logging is enabled.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import random
from typing import Any, Optional, TYPE_CHECKING

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    pass


class WebsocketServiceMessage:
    """Simple envelope matching ConferenceV2's ws_service_message schema."""

    def __init__(
        self,
        websocket_id: str,
        type: str,
        message: str = "",
        position_seconds: Optional[float] = None,
        duration_seconds: Optional[float] = None,
        speed: Optional[float] = None,
    ) -> None:
        self.websocket_id = websocket_id
        self.type = type
        self.message = message
        self.position_seconds = position_seconds
        self.duration_seconds = duration_seconds
        self.speed = speed

    def model_dump(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "websocket_id": self.websocket_id,
            "type": self.type,
            "message": self.message,
        }
        if self.position_seconds is not None:
            d["position_seconds"] = self.position_seconds
        if self.duration_seconds is not None:
            d["duration_seconds"] = self.duration_seconds
        if self.speed is not None:
            d["speed"] = self.speed
        return d

    def model_dump_json(self) -> str:
        return json.dumps(self.model_dump())


class WebsocketClientProvider:
    """Singleton control-channel client for websocket-service.

    Maintains a persistent WebSocket connection with automatic reconnect and
    heartbeat.  All background tasks (heartbeat, message listener) are started
    via ``initialize()`` and cancelled via ``close()``.

    SECURITY: WS_CONTROL_SECRET is sent as a query-parameter on the connection
    URL (Phase 11).  Until then the connection relies on network-level isolation.
    """

    _instance: Optional["WebsocketClientProvider"] = None
    connection_id = "confv2server"
    heartbeat_interval = 30

    def __new__(cls) -> "WebsocketClientProvider":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def initialize(self, conference_manager: Any) -> None:
        """Connect and start background tasks.

        *conference_manager* is the ConferenceCallManager singleton used to
        route inbound messages to the correct ConferenceCall instance.
        """
        from app.platform.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        self._connection_url = settings.websocket_service_url + f"?id={self.connection_id}"
        self.is_connected = False
        self.reconnect_attempts = 0
        self._conference_manager = conference_manager
        self._ws: Any = None
        self._connect_lock = asyncio.Lock()
        self._bg_tasks: list[asyncio.Task[None]] = []

        await self._connect()
        self._start_bg_processes()
        logger.info("WebsocketClientProvider: initialized")

    def _start_bg_processes(self) -> None:
        for task in self._bg_tasks:
            task.cancel()
        self._bg_tasks = [
            asyncio.create_task(self._listen_messages()),
            asyncio.create_task(self._send_heartbeat()),
        ]

    async def close(self) -> None:
        for task in self._bg_tasks:
            task.cancel()
        self._bg_tasks = []
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------

    def _build_extra_headers(self) -> dict[str, str]:
        """Return additional HTTP headers to send on the WebSocket handshake.

        Includes WS-Control-Secret when settings.ws_control_secret is set.
        SECURITY: The secret value is never logged.
        """
        from app.platform.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        headers: dict[str, str] = {}
        if settings.ws_control_secret:
            headers["WS-Control-Secret"] = settings.ws_control_secret
        return headers

    async def _connect(self) -> None:
        import websockets  # type: ignore[import-untyped]

        if not hasattr(self, "_connect_lock"):
            self._connect_lock = asyncio.Lock()

        async with self._connect_lock:
            if self.is_connected and self._ws:
                return
            while not self.is_connected:
                try:
                    extra_headers = self._build_extra_headers()
                    self._ws = await websockets.connect(
                        self._connection_url,
                        additional_headers=extra_headers,
                    )
                    self.is_connected = True
                    self.reconnect_attempts = 0
                    logger.info("WebsocketClientProvider: connected")
                except Exception as exc:
                    self.reconnect_attempts += 1
                    delay = min(1.0 * 2 ** self.reconnect_attempts, 30.0) + random.uniform(0, 1)
                    logger.warning(
                        "WebsocketClientProvider: connect failed (attempt %d), retrying in %.1fs — %s",
                        self.reconnect_attempts, delay, type(exc).__name__,
                    )
                    await asyncio.sleep(delay)

    async def _attempt_reconnect(self) -> None:
        self.reconnect_attempts += 1
        delay = min(1.0 * 2 ** self.reconnect_attempts, 30.0) + random.uniform(0, 1)
        logger.info("WebsocketClientProvider: reconnect attempt %d in %.1fs", self.reconnect_attempts, delay)
        await asyncio.sleep(delay)
        await self._connect()

    # ------------------------------------------------------------------
    # Message listener
    # ------------------------------------------------------------------

    async def _listen_messages(self) -> None:
        import websockets  # type: ignore[import-untyped]
        from app.models.ws_service_message import MessageType, WebsocketServiceMessage as WSMsg  # noqa: PLC0415

        while True:
            await asyncio.sleep(0.5)
            if not (self.is_connected and self._ws):
                await self._attempt_reconnect()
                continue
            try:
                async for raw in self._ws:
                    await self._dispatch_message(raw)
            except websockets.exceptions.ConnectionClosed:
                logger.info("WebsocketClientProvider: connection closed — reconnecting")
                self.is_connected = False
                await self._attempt_reconnect()
            except Exception as exc:
                logger.warning("WebsocketClientProvider: listen error — %s", type(exc).__name__)
                self.is_connected = False
                await self._attempt_reconnect()

    async def _dispatch_message(self, raw: str) -> None:
        """Route inbound message from websocket-service to the correct conference."""
        from app.models.ws_service_message import MessageType  # noqa: PLC0415

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.debug("WebsocketClientProvider: received non-JSON message")
            return

        websocket_id = data.get("websocket_id", "")
        msg_type = data.get("type", "")
        message = data.get("message", "")
        position_seconds = data.get("position_seconds")
        duration_seconds = data.get("duration_seconds")
        speed = data.get("speed")

        if not self._conference_manager:
            return

        conf_call = self._conference_manager.get_conference(websocket_id)
        if conf_call is None:
            return

        if msg_type == MessageType.PLAYBACK_STATE_UPDATES:
            from app.services.confevents.playback_state_update_event import PlaybackStateUpdateEvent  # noqa: PLC0415
            from app.models.audio_content_state import ContentStatus  # noqa: PLC0415

            await conf_call.queue_event(PlaybackStateUpdateEvent(
                conf_call=conf_call,
                content_state=ContentStatus(message),
                position_seconds=position_seconds,
                duration_seconds=duration_seconds,
                speed=speed,
            ))
        elif msg_type == MessageType.AUDIO_DATA:
            if conf_call._remote_audio_queue is not None:
                audio_bytes = base64.b64decode(message)
                try:
                    conf_call._remote_audio_queue.put_nowait(audio_bytes)
                except asyncio.QueueFull:
                    logger.warning("WebsocketClientProvider: audio relay queue full for %s, dropping chunk", websocket_id)
        elif msg_type == MessageType.RECONNECT:
            from app.services.confevents.reconnect_comm_api_websocket_event import ReconnectCommApiWebsocketEvent  # noqa: PLC0415

            await conf_call.queue_event(ReconnectCommApiWebsocketEvent(conf_call=conf_call))

    # ------------------------------------------------------------------
    # Heartbeat
    # ------------------------------------------------------------------

    async def _send_heartbeat(self) -> None:
        while True:
            if self.is_connected and self._ws:
                try:
                    hb = WebsocketServiceMessage(
                        websocket_id=self.connection_id,
                        type="heartbeat",
                    )
                    await self.send_message(hb)
                except Exception as exc:
                    logger.warning("WebsocketClientProvider: heartbeat failed — %s", type(exc).__name__)
                    self.is_connected = False
                    await self._attempt_reconnect()
            else:
                await self._attempt_reconnect()
            await asyncio.sleep(self.heartbeat_interval)

    # ------------------------------------------------------------------
    # Public send
    # ------------------------------------------------------------------

    async def send_message(self, message: WebsocketServiceMessage) -> None:
        """Send *message* to websocket-service.  Raises ConnectionError if not connected."""
        if not self.is_connected:
            raise ConnectionError("WebSocket is not connected to websocket-service")
        try:
            payload = message.model_dump_json()
            await self._ws.send(payload)
            logger.debug("WebsocketClientProvider: message sent type=%s", message.type)
        except Exception as exc:
            logger.warning("WebsocketClientProvider: send failed — %s", type(exc).__name__)
            self.is_connected = False
            await self._attempt_reconnect()
            raise
