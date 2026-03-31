import json
from typing import Any, Dict
from app.models.participant import Participant
from fastapi.responses import StreamingResponse
import asyncio
from app.conf_logger import logger_instance
from app.services.smartphone_connection_manager.base_smartphone_connection_manager import SmartphoneConnectionManager


class SSEConnectionManager(SmartphoneConnectionManager):
    DISCONNECT_SENTINEL = object()

    def __init__(self):
        self.active_connections: Dict[str, Dict] = {}  # Holds client phone_number to message queue and disconnect flag

    async def connect(self, client: Participant):
        """Create a StreamingResponse to handle SSE connection."""
        existing_connection = self.active_connections.get(client.phone_number)
        if existing_connection is not None and not existing_connection.get("disconnected"):
            # Terminate the prior SSE stream before creating a new one
            existing_connection["disconnected"] = True
            await existing_connection["queue"].put(self.DISCONNECT_SENTINEL)
            logger_instance.info(f"SSE Client {client.phone_number} prior connection terminated on reconnect")

        self.active_connections[client.phone_number] = {
            "queue": asyncio.Queue(),
            "disconnected": False
        }
        logger_instance.info(f"SSE Client {client.phone_number} connected")

        async def event_stream():
            connection = self.active_connections.get(client.phone_number)
            if connection is None:
                return

            try:
                while True:
                    if connection["disconnected"]:
                        logger_instance.info(f"Stopping event stream for {client.phone_number}")
                        break
                    try:
                        # Wait for a message with a timeout
                        message = await asyncio.wait_for(
                            connection["queue"].get(),
                            timeout=30.0  # Timeout after 30 seconds
                        )
                        if message is self.DISCONNECT_SENTINEL:
                            logger_instance.info(f"Disconnect sentinel received for {client.phone_number}")
                            break
                        logger_instance.info('Sending SSE event', message)
                        yield f"data: {json.dumps(message)}\n\n"
                    except asyncio.TimeoutError:
                        # Send a heartbeat message
                        yield ": heartbeat\n\n"
                    except asyncio.CancelledError:
                        logger_instance.info(f"Event stream task canceled for {client.phone_number}")
                        break
            finally:
                if self.active_connections.get(client.phone_number) is connection:
                    del self.active_connections[client.phone_number]

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    async def disconnect(self, client: Participant):
        """Remove client from active connections."""
        connection = self.active_connections.get(client.phone_number)
        if connection:
            # Mark disconnected and wake the stream loop without deleting shared state mid-iteration.
            connection["disconnected"] = True
            await connection["queue"].put(self.DISCONNECT_SENTINEL)
            logger_instance.info(f"SSE Client {client.phone_number} disconnected")

    async def send_message_to_client(self, client: Participant, message: dict):
        """Send a message to the client via the client's message queue."""
        connection = self.active_connections.get(client.phone_number)
        if connection and not connection["disconnected"]:
            await connection["queue"].put(message)  # Queue message for client
