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
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Message model
# ---------------------------------------------------------------------------

class MessageType(str, Enum):
    CALL_WEBHOOK = "call_webhook"
    DTMF_INPUT = "dtmf_input"
    CALL_EVENT = "call_event"


class QueueMessage:
    """Minimal message wrapper compatible with IVRv2 QueueMessage interface."""

    def __init__(
        self,
        type: MessageType,
        payload: Dict[str, Any],
        message_id: Optional[str] = None,
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
    def from_json_string(cls, json_string: str) -> "QueueMessage":
        data = json.loads(json_string)
        return cls(
            type=MessageType(data["type"]),
            payload=data["payload"],
            message_id=data.get("message_id"),
        )


# ---------------------------------------------------------------------------
# Azure Service Bus queue wrapper
# ---------------------------------------------------------------------------

class _AzureQueueHandle:
    """Manages a single Azure Service Bus queue connection."""

    def __init__(self, connection_string: str, queue_name: str) -> None:
        self.connection_string = connection_string
        self.queue_name = queue_name
        self._client = None
        self._receiver = None
        self._message_map: Dict[str, Any] = {}

    async def initialize(self) -> None:
        from azure.servicebus.aio import ServiceBusClient  # noqa: PLC0415

        self._client = ServiceBusClient.from_connection_string(conn_str=self.connection_string)
        self._receiver = self._client.get_queue_receiver(
            queue_name=self.queue_name,
            max_wait_time=30,  # SDK-level default; prevents indefinite hang if no messages arrive
        )
        await self._receiver.__aenter__()
        logger.info("ServiceBus queue initialized: %s", self.queue_name)

    async def close(self) -> None:
        if self._receiver:
            try:
                await self._receiver.__aexit__(None, None, None)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Error closing receiver for %s: %s", self.queue_name, exc)
        if self._client:
            try:
                await self._client.close()
            except Exception as exc:  # noqa: BLE001
                logger.warning("Error closing client for %s: %s", self.queue_name, exc)

    async def send(self, message: QueueMessage) -> bool:
        try:
            from azure.servicebus import ServiceBusMessage  # noqa: PLC0415

            sb_msg = ServiceBusMessage(
                body=message.to_json_string(),
                content_type="application/json",
                message_id=message.message_id,
            )
            async with self._client.get_queue_sender(queue_name=self.queue_name) as sender:
                await sender.send_messages(sb_msg)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to send to %s: %s", self.queue_name, exc)
            return False

    async def receive(self, max_count: int = 10, wait_seconds: int = 5) -> List[QueueMessage]:
        try:
            raw_msgs = await self._receiver.receive_messages(
                max_message_count=max_count,
            )
            messages: List[QueueMessage] = []
            for raw in raw_msgs:
                try:
                    msg = QueueMessage.from_json_string(str(raw))
                    msg.message_id = raw.message_id or msg.message_id
                    self._message_map[msg.message_id] = raw
                    messages.append(msg)
                except Exception as exc:  # noqa: BLE001
                    logger.error("Failed to parse message from %s: %s", self.queue_name, exc)
                    await self._receiver.dead_letter_message(raw, reason="ParseError")
            return messages
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to receive from %s: %s", self.queue_name, exc)
            await asyncio.sleep(0.1)  # prevent tight loop on repeated receive errors
            return []

    async def complete(self, message: QueueMessage) -> bool:
        raw = self._message_map.pop(message.message_id, None)
        if raw is None:
            return False
        try:
            await self._receiver.complete_message(raw)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to complete message %s: %s", message.message_id, exc)
            return False

    async def abandon(self, message: QueueMessage) -> bool:
        raw = self._message_map.pop(message.message_id, None)
        if raw is None:
            return False
        try:
            await self._receiver.abandon_message(raw)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to abandon message %s: %s", message.message_id, exc)
            return False

    async def dead_letter(self, message: QueueMessage, reason: str) -> bool:
        raw = self._message_map.pop(message.message_id, None)
        if raw is None:
            return False
        try:
            await self._receiver.dead_letter_message(raw, reason=reason)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to DLQ message %s: %s", message.message_id, exc)
            return False


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
    }

    def __init__(self) -> None:
        self._call_webhook: Optional[_AzureQueueHandle] = None
        self._dtmf_input: Optional[_AzureQueueHandle] = None
        self._call_event: Optional[_AzureQueueHandle] = None
        self._initialized = False

    async def initialize(self) -> None:
        if self._initialized:
            logger.warning("ServiceBusProvider already initialized")
            return

        from app.platform.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        conn_str = settings.azure_service_bus_connection_string

        if not conn_str:
            logger.warning(
                "AZURE_SERVICE_BUS_CONNECTION_STRING not set — ServiceBusProvider running in no-op mode"
            )
            self._initialized = True
            return

        self._call_webhook = _AzureQueueHandle(conn_str, settings.call_webhook_queue_name)
        self._dtmf_input = _AzureQueueHandle(conn_str, settings.dtmf_input_queue_name)
        self._call_event = _AzureQueueHandle(conn_str, settings.call_event_queue_name)

        await asyncio.gather(
            self._call_webhook.initialize(),
            self._dtmf_input.initialize(),
            self._call_event.initialize(),
        )
        self._initialized = True
        logger.info("ServiceBusProvider initialized (3 queues)")

    async def close(self) -> None:
        handles = [self._call_webhook, self._dtmf_input, self._call_event]
        close_tasks = [h.close() for h in handles if h is not None]
        if close_tasks:
            await asyncio.gather(*close_tasks, return_exceptions=True)
        self._initialized = False
        logger.info("ServiceBusProvider closed")

    def _get_handle(self, queue_name: str) -> Optional[_AzureQueueHandle]:
        mapping: Dict[str, Optional[_AzureQueueHandle]] = {
            "call_webhook": self._call_webhook,
            "dtmf_input": self._dtmf_input,
            "call_event": self._call_event,
        }
        handle = mapping.get(queue_name)
        if handle is None:
            logger.warning("No handle for queue: %s", queue_name)
        return handle

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def send_message(self, queue_name: str, message: dict) -> bool:
        """Send a dict payload to a named queue."""
        handle = self._get_handle(queue_name)
        if handle is None:
            return False
        msg_type = MessageType(queue_name)
        msg = QueueMessage(type=msg_type, payload=message)
        return await handle.send(msg)

    async def receive_messages(
        self, queue_name: str, max_count: int = 10, wait_seconds: int = 5
    ) -> List[QueueMessage]:
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

    async def send_call_webhook(self, payload: dict) -> bool:
        return await self.send_message("call_webhook", payload)

    async def send_dtmf_input(self, payload: dict) -> bool:
        return await self.send_message("dtmf_input", payload)

    async def send_call_event(self, payload: dict) -> bool:
        return await self.send_message("call_event", payload)

    def get_call_webhook_queue(self) -> Optional[_AzureQueueHandle]:
        return self._call_webhook

    def get_dtmf_input_queue(self) -> Optional[_AzureQueueHandle]:
        return self._dtmf_input

    def get_call_event_queue(self) -> Optional[_AzureQueueHandle]:
        return self._call_event


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

service_bus_provider = ServiceBusProvider()
