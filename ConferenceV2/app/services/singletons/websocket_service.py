import asyncio
import base64
import json
import random
from dotenv import load_dotenv
import websockets
from app.models.audio_content_state import ContentStatus
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.confevents.playback_state_update_event import PlaybackStateUpdateEvent
from app.services.confevents.reconnect_comm_api_websocket_event import ReconnectCommApiWebsocketEvent
from app.services.singletons.conference_call_manager import conference_manager
from app.conf_logger import logger_instance
from config import get_settings

load_dotenv()

class WebsocketService:
    _instance = None  # Singleton instance
    connection_id = "confv2server"
    heartbeat_interval = 30

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def initialize(self):
        settings = get_settings()
        self.connection_url = settings.WS_SERVER_EP + f"?id={self.connection_id}"
        self.is_connected = False
        self.reconnect_attempts = 0
        self.conference_manager = conference_manager
        self.bg_tasks = []
        self._ws = None
        self._connect_lock = asyncio.Lock()
        await self._connect()
        self._start_bg_processes()
    
    def _start_bg_processes(self):
        if len(self.bg_tasks) > 0:
            for task in self.bg_tasks:
                task.cancel()
                
        self.bg_tasks = [
            asyncio.create_task(self._listen_messages()), 
            asyncio.create_task(self._send_heartbeat())
        ]
    
    def cancel_bg_processes(self):
        for task in self.bg_tasks:
            task.cancel()

    async def _connect(self):
        if not hasattr(self, "_connect_lock"):
            self._connect_lock = asyncio.Lock()

        async with self._connect_lock:
            if self.is_connected and self._ws:
                return

            while not self.is_connected:
                try:
                    self._ws = await websockets.connect(self.connection_url)
                    self.is_connected = True
                    self.reconnect_attempts = 0  # Reset on successful connection
                    logger_instance.info(f"Connected to WebSocket: {self.connection_url}")
                except Exception as e:
                    self.reconnect_attempts += 1
                    delay = min(1.0 * 2 ** self.reconnect_attempts, 30.0) + random.uniform(0, 1)
                    logger_instance.info(f"Connection failed (attempt {self.reconnect_attempts}), retrying in {delay:.1f}s: {e}")
                    await asyncio.sleep(delay)

    async def _listen_messages(self):
        while True:
            await asyncio.sleep(0.5)  # Wait before reconnecting in case of disconnection
            if self.is_connected and self._ws:
                try:
                    logger_instance.info("Listening for messages from WebSocket service...")
                    async for message in self._ws:
                        websocket_message = WebsocketServiceMessage(**json.loads(message))
                        if websocket_message.type == MessageType.PLAYBACK_STATE_UPDATES:
                            conf_call = conference_manager.get_conference(websocket_message.websocket_id)
                            if conf_call:
                                await conf_call.queue_event(PlaybackStateUpdateEvent(
                                    conf_call=conf_call,
                                    content_state=ContentStatus(websocket_message.message),
                                    position_seconds=websocket_message.position_seconds,
                                    duration_seconds=websocket_message.duration_seconds,
                                    speed=websocket_message.speed,
                                ))
                        elif websocket_message.type == MessageType.AUDIO_DATA:
                            conf_call = conference_manager.get_conference(websocket_message.websocket_id)
                            if conf_call and conf_call._remote_audio_queue is not None:
                                audio_bytes = base64.b64decode(websocket_message.message)
                                try:
                                    conf_call._remote_audio_queue.put_nowait(audio_bytes)
                                except asyncio.QueueFull:
                                    logger_instance.warning(
                                        "Audio relay queue full for %s, dropping chunk",
                                        websocket_message.websocket_id,
                                    )
                        elif websocket_message.type == MessageType.RECONNECT:
                            conf_call = conference_manager.get_conference(websocket_message.websocket_id)
                            if conf_call:
                                await conf_call.queue_event(ReconnectCommApiWebsocketEvent(conf_call=conf_call))
                except websockets.exceptions.ConnectionClosed:
                    logger_instance.info("Connection closed. Attempting to reconnect...")
                    self.is_connected = False
                    await self._attempt_reconnect()
                except Exception as e:
                    logger_instance.info(f"Error while listening: {e}")
                    self.is_connected = False
                    await self._attempt_reconnect()
            else:
                # If not connected, attempt to reconnect
                await self._attempt_reconnect()
    
    async def _send_heartbeat(self):
        """Send heartbeat messages to keep the WebSocket connection alive."""
        logger_instance.info("Starting to send heartbeats to WebSocket service...")
        while True:
            if self.is_connected and self._ws:
                try:
                    heartbeat_message = WebsocketServiceMessage(
                        websocket_id=self.connection_id,
                        type=MessageType.HEARTBEAT
                    )
                    await self.send_message(heartbeat_message)
                except Exception as e:
                    logger_instance.info(f"Failed to send heartbeat message: {e}")
                    self.is_connected = False
                    await self._attempt_reconnect()
            else:
                # If not connected, attempt to reconnect
                await self._attempt_reconnect()
            await asyncio.sleep(self.heartbeat_interval)  # Wait for the next heartbeat interval

    async def _attempt_reconnect(self):
        self.reconnect_attempts += 1
        delay = min(1.0 * 2 ** self.reconnect_attempts, 30.0) + random.uniform(0, 1)
        logger_instance.info(f"Reconnection attempt {self.reconnect_attempts}, waiting {delay:.1f}s")
        await asyncio.sleep(delay)
        await self._connect()

    async def send_message(self, message: WebsocketServiceMessage):
        if not self.is_connected:
            raise ConnectionError("WebSocket is not connected")
        try:
            message_str = message.model_dump_json()
            await self._ws.send(message_str)
            logger_instance.info(f"Message sent to WebSocket service: {message_str}")
        except Exception as e:
            logger_instance.info(f"Failed to send message: {e}")
            self.is_connected = False
            await self._attempt_reconnect()
            raise
