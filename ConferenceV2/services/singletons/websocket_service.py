import asyncio
import json
import os
import websockets
from models.websocket_message import MessageType, WebsocketMessage
from services.singletons.conference_call_manager import conference_manager

class WebsocketService:
    _instance = None  # Singleton instance
    connection_id = "confv2server"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
            asyncio.create_task(cls._instance._initialize())
        return cls._instance

    async def _initialize(self):
        self.connection_url = os.environ.get("WS_SERVER_EP", "") + f"?id={self.connection_id}"
        self.is_connected = False
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 3
        self._initialized = True
        self.conference_manager = conference_manager
        await self._connect()
        asyncio.create_task(self._listen_messages())

    async def _connect(self):
        while not self.is_connected and self.reconnect_attempts < self.max_reconnect_attempts:
            try:
                self._ws = await websockets.connect(self.connection_url)
                self.is_connected = True
                self.reconnect_attempts = 0  # Reset on successful connection
                print("Connected to WebSocket", self.connection_url)
            except Exception as e:
                self.reconnect_attempts += 1
                print(f"Connection failed ({self.reconnect_attempts}/{self.max_reconnect_attempts}): {e}")
                if self.reconnect_attempts >= self.max_reconnect_attempts:
                    raise ConnectionError("Maximum reconnection attempts reached")
                await asyncio.sleep(2)  # Wait before retrying

    async def _listen_messages(self):
        while True:
            if self.is_connected and self._ws:
                try:
                    async for message in self._ws:
                        print(f"Received message: {message}")
                        # Process the message as needed
                except websockets.exceptions.ConnectionClosed:
                    print("Connection closed. Attempting to reconnect...")
                    self.is_connected = False
                    await self._attempt_reconnect()
                except Exception as e:
                    print(f"Error while listening: {e}")
                    self.is_connected = False
                    await self._attempt_reconnect()
            else:
                await asyncio.sleep(1)  # Wait before checking connection again

    async def _attempt_reconnect(self):
        self.reconnect_attempts += 1
        if self.reconnect_attempts >= self.max_reconnect_attempts:
            raise ConnectionError("Maximum reconnection attempts reached")
        await asyncio.sleep(2)  # Wait before reconnecting
        await self._connect()

    async def send_message(self, message: WebsocketMessage):
        if not self.is_connected:
            raise ConnectionError("WebSocket is not connected")
        try:
            message_str = json.dumps(message.model_dump_json())
            await self._ws.send(message_str)
            print(f"Message sent to websocket service: {message_str}")
        except Exception as e:
            print(f"Failed to send message: {e}")
            self.is_connected = False
            await self._attempt_reconnect()
            raise