"""SSE-based connection manager for the teacher smartphone app."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from starlette.responses import StreamingResponse

logger = logging.getLogger(__name__)

_KEEPALIVE_INTERVAL = 15  # seconds between keepalive comments


class SmartphoneConnectionManager:
    """One instance per active conference. Holds one SSE stream (the teacher)."""

    def __init__(self, conf_id: str) -> None:
        self.conf_id = conf_id
        self._queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def connect(self, client: Any) -> StreamingResponse:
        """Return an SSE StreamingResponse that streams queued messages to the teacher."""

        async def _event_stream():
            try:
                while True:
                    try:
                        payload = await asyncio.wait_for(self._queue.get(), timeout=_KEEPALIVE_INTERVAL)
                    except TimeoutError:
                        yield ": keepalive\n\n"
                        continue

                    if payload is None:  # sentinel — conference ended
                        break
                    yield f"data: {payload}\n\n"
            except asyncio.CancelledError:
                pass

        return StreamingResponse(
            _event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    async def disconnect(self, client: Any) -> dict:
        self._queue.put_nowait(None)  # unblock the stream
        return {}

    async def send_message_to_client(self, client: Any, message: Any) -> None:
        try:
            self._queue.put_nowait(json.dumps(message))
        except asyncio.QueueFull:
            logger.warning("smartphone_connection: queue full for conf_id=%s, dropping message", self.conf_id)


class SmartphoneConnectionManagerFactory:
    def create(self, conf_id: str) -> SmartphoneConnectionManager:
        return SmartphoneConnectionManager(conf_id)
