import asyncio
import json
import os
from dotenv import load_dotenv
import websockets
from models.audio_content_state import ContentStatus
from models.ws_service_message import MessageType, WebsocketServiceMessage
from services.confevents.playback_state_update_event import PlaybackStateUpdateEvent
from services.confevents.reconnect_comm_api_websocket_event import ReconnectCommApiWebsocketEvent
from services.singletons.conference_call_manager import conference_manager
from conf_logger import logger_instance

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
        self.connection_url = os.environ.get("WS_SERVER_EP", "") + f"?id={self.connection_id}"
        self.is_connected = False
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 3
        self.conference_manager = conference_manager
        self.bg_tasks = []
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
        while not self.is_connected and self.reconnect_attempts < self.max_reconnect_attempts:
            try:
                self._ws = await websockets.connect(self.connection_url)
                self.is_connected = True
                self.reconnect_attempts = 0  # Reset on successful connection
                logger_instance.info("Connected to WebSocket", self.connection_url)
            except Exception as e:
                self.reconnect_attempts += 1
                logger_instance.info(f"Connection failed ({self.reconnect_attempts}/{self.max_reconnect_attempts}): {e}")
                if self.reconnect_attempts >= self.max_reconnect_attempts:
                    raise ConnectionError("Maximum reconnection attempts reached")
                await asyncio.sleep(2)  # Wait before retrying

    async def _listen_messages(self):
        while True:
            await asyncio.sleep(0.5) # Wait before reconnecting in case of disconnection
            if self.is_connected and self._ws:
                try:
                    logger_instance.info("LISTENING MESSAGES FROM WS SERVICE...")
                    async for message in self._ws:
                        # logger_instance.info(f"Received message: {message}")
                        websocket_message = WebsocketServiceMessage(**json.loads(message))
                        if websocket_message.type == MessageType.PLAYBACK_STATE_UPDATES:
                            conf_call = conference_manager.get_conference(websocket_message.websocket_id)
                            if conf_call:
                                await conf_call.queue_event(PlaybackStateUpdateEvent(conf_call=conf_call, 
                                                                               content_state=ContentStatus(websocket_message.message)))
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
    
    async def _send_heartbeat(self):
        """Send heartbeat messages to keep the WebSocket connection alive."""
        logger_instance.info("STARTING TO SEND HEARTBEATS TO WS SERVICE...")
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
            await asyncio.sleep(self.heartbeat_interval)  # Wait for the next heartbeat interval

    async def _attempt_reconnect(self):
        self.reconnect_attempts += 1
        if self.reconnect_attempts >= self.max_reconnect_attempts:
            raise ConnectionError("Maximum reconnection attempts reached")
        await asyncio.sleep(2)  # Wait before reconnecting
        await self._connect()

    async def send_message(self, message: WebsocketServiceMessage):
        if not self.is_connected:
            raise ConnectionError("WebSocket is not connected")
        try:
            message_str = json.dumps(message.model_dump_json())
            await self._ws.send(message_str)
            logger_instance.info(f"Message sent to websocket service: {message_str}")
        except Exception as e:
            logger_instance.info(f"Failed to send message: {e}")
            self.is_connected = False
            await self._attempt_reconnect()
            raise