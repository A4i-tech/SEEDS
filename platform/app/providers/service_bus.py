"""ServiceBusProvider — unified Azure Service Bus client for IVR queues.

Merges IVRv2/app/services/service_bus_manager.py + services/queue/ into a
single flat provider under app/providers/.

Supports three named queues:
  - call_webhook  (missed-call webhook messages)
  - dtmf_input    (DTMF keypress messages from Vonage)
  - call_event    (call lifecycle events from Vonage)
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime
from enum import StrEnum
from functools import partial
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.providers.azure_service_bus_queue import _AzureQueueHandle
    from app.providers.nats_queue import _NatsQueueHandle

    _QueueHandle = _AzureQueueHandle | _NatsQueueHandle

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Message model
# ---------------------------------------------------------------------------

class MessageType(StrEnum):
    CALL_WEBHOOK = "call_webhook"
    DTMF_INPUT = "dtmf_input"
    CALL_EVENT = "call_event"
    SYNC_JOBS = "sync_jobs"


class QueueMessage:
    """Minimal message wrapper compatible with IVRv2 QueueMessage interface."""

    def __init__(
        self,
        type: MessageType,
        payload: dict[str, Any],
        message_id: str | None = None,
    ) -> None:
        self.type = type
        self.payload = payload
        self.message_id = message_id or str(uuid.uuid4())
        self.timestamp = datetime.utcnow()
        self.retry_count = 0

    def to_json_string(self) -> str:
        return json.dumps(
            {
                "type": self.type.value,
                "payload": self.payload,
                "message_id": self.message_id,
                "timestamp": self.timestamp.isoformat(),
                "retry_count": self.retry_count,
            }
        )

    @classmethod
    def from_json_string(cls, json_string: str) -> QueueMessage:
        data = json.loads(json_string)
        return cls(
            type=MessageType(data["type"]),
            payload=data["payload"],
            message_id=data.get("message_id"),
        )


# ---------------------------------------------------------------------------
# ServiceBusProvider — public interface
# ---------------------------------------------------------------------------

class ServiceBusProvider:
    """Unified Service Bus client for both IVR queues and conference service bus.

    Usage::

        provider = ServiceBusProvider()
        await provider.initialize()
        await provider.send_message("call_webhook", {"phone_number": "+91..."})
        msgs = await provider.receive_messages("dtmf_input", max_count=5)
        await provider.complete_message(msgs[0])
    """

    QUEUE_ALIASES = {
        "call_webhook": "_call_webhook",
        "dtmf_input": "_dtmf_input",
        "call_event": "_call_event",
        "sync_jobs": "_sync_jobs",
    }

    def __init__(self) -> None:
        self._call_webhook: _QueueHandle | None = None
        self._dtmf_input: _QueueHandle | None = None
        self._call_event: _QueueHandle | None = None
        self._sync_jobs: _QueueHandle | None = None
        self._initialized = False
        self._init_lock = asyncio.Lock()

    async def initialize(self) -> None:
        async with self._init_lock:
            if self._initialized:
                return
            await self._do_initialize()

    async def _do_initialize(self) -> None:
        from app.platform.settings import get_settings  # noqa: PLC0415

        settings = get_settings()

        if settings.queue_provider == "azure_service_bus":
            from app.providers.azure_service_bus_queue import _AzureQueueHandle  # noqa: PLC0415

            make_handle = partial(_AzureQueueHandle, settings.azure_service_bus_connection_string)
        else:
            from app.providers.nats_queue import _NatsQueueHandle  # noqa: PLC0415

            make_handle = partial(_NatsQueueHandle, settings)

        handles = [
            make_handle(settings.call_webhook_queue_name),
            make_handle(settings.dtmf_input_queue_name),
            make_handle(settings.call_event_queue_name),
            make_handle(settings.sync_jobs_queue_name),
        ]
        try:
            results = await asyncio.gather(*(h.initialize() for h in handles), return_exceptions=True)
            failures = [(h, r) for h, r in zip(handles, results, strict=True) if isinstance(r, BaseException)]
            if failures:
                for h, r in failures:
                    logger.error("Failed to initialize queue %s: %s", h.queue_name, r)
                raise failures[0][1]
        except BaseException:
            await asyncio.gather(*(h.close() for h in handles), return_exceptions=True)
            raise

        self._call_webhook, self._dtmf_input, self._call_event, self._sync_jobs = handles
        self._initialized = True
        logger.info("ServiceBusProvider initialized (4 queues)")

    async def close(self) -> None:
        async with self._init_lock:
            handles = [self._call_webhook, self._dtmf_input, self._call_event, self._sync_jobs]
            close_tasks = [h.close() for h in handles if h is not None]
            if close_tasks:
                await asyncio.gather(*close_tasks, return_exceptions=True)
            self._initialized = False
            logger.info("ServiceBusProvider closed")

    def _get_handle(self, queue_name: str) -> _QueueHandle | None:
        mapping: dict[str, _QueueHandle | None] = {
            "call_webhook": self._call_webhook,
            "dtmf_input": self._dtmf_input,
            "call_event": self._call_event,
            "sync_jobs": self._sync_jobs,
        }
        handle = mapping.get(queue_name)
        if handle is None:
            logger.warning("No handle for queue: %s", queue_name)
        return handle

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def send_message(
        self, queue_name: str, message: dict, message_id: str | None = None
    ) -> bool:
        """Send a dict payload to a named queue."""
        handle = self._get_handle(queue_name)
        if handle is None:
            return False
        msg_type = MessageType(queue_name)
        msg = QueueMessage(type=msg_type, payload=message, message_id=message_id)
        return await handle.send(msg)

    async def receive_messages(
        self, queue_name: str, max_count: int = 10, wait_seconds: int = 5
    ) -> list[QueueMessage]:
        """Receive up to *max_count* messages from a named queue."""
        handle = self._get_handle(queue_name)
        if handle is None:
            return []
        return await handle.receive(max_count=max_count, wait_seconds=wait_seconds)

    async def complete_message(self, queue_name: str, msg: QueueMessage) -> bool:
        """Mark a received message as successfully processed (delete from queue)."""
        handle = self._get_handle(queue_name)
        if handle is None:
            return False
        return await handle.complete(msg)

    async def abandon_message(self, queue_name: str, msg: QueueMessage) -> bool:
        """Return a message to the queue for retry."""
        handle = self._get_handle(queue_name)
        if handle is None:
            return False
        return await handle.abandon(msg)

    async def dead_letter_message(
        self, queue_name: str, msg: QueueMessage, reason: str
    ) -> bool:
        """Move a message to the dead-letter queue."""
        handle = self._get_handle(queue_name)
        if handle is None:
            return False
        return await handle.dead_letter(msg, reason)

    # ------------------------------------------------------------------
    # IVRv2 compatibility helpers (used by ivr_service.py)
    # ------------------------------------------------------------------

    async def send_call_webhook(self, payload: dict, message_id: str | None = None) -> bool:
        return await self.send_message("call_webhook", payload, message_id=message_id)

    async def send_dtmf_input(self, payload: dict, message_id: str | None = None) -> bool:
        return await self.send_message("dtmf_input", payload, message_id=message_id)

    async def send_call_event(self, payload: dict) -> bool:
        return await self.send_message("call_event", payload)

    async def send_sync_job(self, payload: dict) -> bool:
        return await self.send_message("sync_jobs", payload)

    def get_call_webhook_queue(self) -> _QueueHandle | None:
        return self._call_webhook

    def get_dtmf_input_queue(self) -> _QueueHandle | None:
        return self._dtmf_input

    def get_call_event_queue(self) -> _QueueHandle | None:
        return self._call_event

    def get_sync_jobs_queue(self) -> _QueueHandle | None:
        return self._sync_jobs


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

service_bus_provider = ServiceBusProvider()
