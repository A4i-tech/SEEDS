"""SSE-based smartphone connection manager — ported 1:1 from ConferenceV2."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

_DISCONNECT_SENTINEL = object()


class SSEConnectionManager:
    """Manages per-client SSE streams keyed by phone number.

    1:1 port of ConferenceV2 app/services/smartphone_connection_manager/sse_connection_manager.py
    """

    def __init__(self) -> None:
        self.active_connections: dict[str, dict[str, Any]] = {}

    async def connect(self, client: Any) -> StreamingResponse:
        phone = client.phone_number if hasattr(client, "phone_number") else str(client)

        existing = self.active_connections.get(phone)
        if existing is not None and not existing.get("disconnected"):
            existing["disconnected"] = True
            await existing["queue"].put(_DISCONNECT_SENTINEL)
            logger.info("SSE client %s prior connection terminated on reconnect", phone)

        self.active_connections[phone] = {"queue": asyncio.Queue(), "disconnected": False}
        logger.info("SSE client %s connected", phone)

        async def event_stream() -> Any:
            connection = self.active_connections.get(phone)
            if connection is None:
                return
            try:
                while True:
                    if connection["disconnected"]:
                        logger.info("Stopping event stream for %s", phone)
                        break
                    try:
                        message = await asyncio.wait_for(connection["queue"].get(), timeout=30.0)
                        if message is _DISCONNECT_SENTINEL:
                            logger.info("Disconnect sentinel received for %s", phone)
                            break
                        yield f"data: {json.dumps(message)}\n\n"
                    except TimeoutError:
                        yield ": heartbeat\n\n"
                    except asyncio.CancelledError:
                        logger.info("Event stream cancelled for %s", phone)
                        break
            finally:
                if self.active_connections.get(phone) is connection:
                    del self.active_connections[phone]

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    async def disconnect(self, client: Any) -> dict:
        phone = client.phone_number if hasattr(client, "phone_number") else str(client)
        connection = self.active_connections.get(phone)
        if connection:
            connection["disconnected"] = True
            await connection["queue"].put(_DISCONNECT_SENTINEL)
            logger.info("SSE client %s disconnected", phone)
        return {}

    async def send_message_to_client(self, client: Any, message: Any) -> None:
        phone = client.phone_number if hasattr(client, "phone_number") else str(client)
        connection = self.active_connections.get(phone)
        if connection and not connection["disconnected"]:
            await connection["queue"].put(message)
