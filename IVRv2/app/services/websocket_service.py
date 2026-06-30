"""
WebSocket service for IVRv2 control connection.

Maintains a persistent WebSocket connection to the websocket-service
for sending control commands (set speed, stop audio, etc.).
"""

import asyncio
import json
import logging
from typing import Optional

import websockets
from websockets.exceptions import ConnectionClosed

from app.settings import settings
from app.utils.ws_service_message import MessageType, WebsocketServiceMessage


logger = logging.getLogger(__name__)


class WebsocketService:
    """Singleton WebSocket service for IVRv2 control connection."""

    _instance: Optional['WebsocketService'] = None
    _initialized: bool = False

    CONNECTION_ID = "ivrv2server"
    HEARTBEAT_INTERVAL = 30  # seconds
    RECONNECT_DELAY = 2  # seconds

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def initialize(self):
        """Initialize the WebSocket connection and background tasks."""
        if self._initialized:
            logger.warning("WebsocketService already initialized")
            return

        # Build connection URL
        ws_url = settings.websocket_service_url
        self.connection_url = f"{ws_url}?id={self.CONNECTION_ID}"

        self.is_connected = False
        self.reconnect_attempts = 0
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._bg_tasks: list[asyncio.Task] = []

        # Connect and start background processes
        await self._connect()
        self._start_bg_processes()

        self._initialized = True
        logger.info("WebsocketService initialized successfully")

    def _start_bg_processes(self):
        """Start background tasks for heartbeat and message listening."""
        # Cancel existing tasks if any
        for task in self._bg_tasks:
            task.cancel()

        self._bg_tasks = [
            asyncio.create_task(self._send_heartbeat(), name="ws_heartbeat"),
        ]
        logger.info("Background processes started")

    def cancel_bg_processes(self):
        """Cancel all background tasks."""
        for task in self._bg_tasks:
            task.cancel()
        logger.info("Background processes cancelled")

    async def _connect(self):
        """Establish WebSocket connection with retry logic."""
        while not self.is_connected:
            try:
                self._ws = await websockets.connect(self.connection_url)
                self.is_connected = True
                self.reconnect_attempts = 0
                logger.info(f"Connected to WebSocket: {self.connection_url}")
            except Exception as e:
                self.reconnect_attempts += 1
                logger.warning(
                    f"WebSocket connection failed (attempt {self.reconnect_attempts}): {e}"
                )
                await asyncio.sleep(self.RECONNECT_DELAY)

    async def _send_heartbeat(self):
        """Send periodic heartbeat messages to keep connection alive."""
        logger.info("Starting heartbeat sender")
        while True:
            await asyncio.sleep(self.HEARTBEAT_INTERVAL)

            if self.is_connected and self._ws:
                try:
                    heartbeat_message = WebsocketServiceMessage(
                        websocket_id=self.CONNECTION_ID,
                        type=MessageType.HEARTBEAT
                    )
                    await self.send_message(heartbeat_message)
                except Exception as e:
                    logger.warning(f"Failed to send heartbeat: {e}")
                    self.is_connected = False
                    await self._attempt_reconnect()
            else:
                await self._attempt_reconnect()

    async def _attempt_reconnect(self):
        """Attempt to reconnect to WebSocket service."""
        if self.is_connected:
            return  # Already connected

        self.reconnect_attempts += 1
        logger.info(f"Reconnection attempt {self.reconnect_attempts}")
        await asyncio.sleep(self.RECONNECT_DELAY)
        await self._connect()

    async def send_message(self, message: WebsocketServiceMessage):
        """
        Send a message to the WebSocket service.

        Args:
            message: WebsocketServiceMessage to send

        Raises:
            ConnectionError: If WebSocket is not connected
        """
        if not self.is_connected or not self._ws:
            raise ConnectionError("WebSocket is not connected")

        try:
            message_str = message.model_dump_json()
            await self._ws.send(message_str)
            logger.info(f"Message sent to WebSocket service: {message_str}")
        except ConnectionClosed as e:
            logger.error(f"Connection closed while sending message: {e}")
            self.is_connected = False
            await self._attempt_reconnect()
            raise ConnectionError("WebSocket connection closed") from e
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            self.is_connected = False
            await self._attempt_reconnect()
            raise

    async def set_playback_speed(self, websocket_id: str, speed: float):
        """
        Set playback speed for a specific WebSocket connection.

        Args:
            websocket_id: ID of the WebSocket connection (format: "conv_id:state_id")
            speed: Playback speed (0.75 - 2.0)
        """
        await self.send_message(
            WebsocketServiceMessage(
                websocket_id=websocket_id,
                type=MessageType.SET_SPEED,
                message=str(speed),
                speed=speed
            )
        )

    async def stop_audio(self, websocket_id: str):
        """
        Stop audio playback for a specific WebSocket connection.

        Args:
            websocket_id: ID of the WebSocket connection
        """
        await self.send_message(
            WebsocketServiceMessage(
                websocket_id=websocket_id,
                type=MessageType.STOP_AUDIO
            )
        )

    async def pause_audio(self, websocket_id: str):
        """
        Pause audio playback for a specific WebSocket connection.

        Args:
            websocket_id: ID of the WebSocket connection
        """
        await self.send_message(
            WebsocketServiceMessage(
                websocket_id=websocket_id,
                type=MessageType.PAUSE_AUDIO
            )
        )

    async def resume_audio(self, websocket_id: str):
        """
        Resume audio playback for a specific WebSocket connection.

        Args:
            websocket_id: ID of the WebSocket connection
        """
        await self.send_message(
            WebsocketServiceMessage(
                websocket_id=websocket_id,
                type=MessageType.RESUME_AUDIO
            )
        )

    async def disconnect(self, websocket_id: str):
        """
        Disconnect a specific WebSocket connection.

        Args:
            websocket_id: ID of the WebSocket connection
        """
        await self.send_message(
            WebsocketServiceMessage(
                websocket_id=websocket_id,
                type=MessageType.DISCONNECT
            )
        )

    async def close(self):
        """Close the WebSocket connection and cleanup."""
        self.cancel_bg_processes()

        if self._ws:
            await self._ws.close()
            self._ws = None

        self.is_connected = False
        self._initialized = False
        logger.info("WebSocket service closed")


# Global instance
_websocket_service: Optional[WebsocketService] = None


async def get_websocket_service() -> WebsocketService:
    """
    Get the global WebsocketService instance.

    Returns:
        WebsocketService instance
    """
    global _websocket_service

    if _websocket_service is None:
        _websocket_service = WebsocketService()
        await _websocket_service.initialize()

    return _websocket_service
