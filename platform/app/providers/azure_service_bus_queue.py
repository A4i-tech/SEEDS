from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.providers.service_bus import QueueMessage

logger = logging.getLogger(__name__)


class _AzureQueueHandle:
    """Manages a single Azure Service Bus queue connection."""

    def __init__(self, connection_string: str, queue_name: str) -> None:
        self.connection_string = connection_string
        self.queue_name = queue_name
        self._client = None
        self._receiver = None
        self._message_map: dict[str, Any] = {}

    async def initialize(self) -> None:
        await self._connect()
        logger.info("ServiceBus queue initialized: %s", self.queue_name)

    async def _connect(self) -> None:
        try:
            from azure.servicebus.aio import ServiceBusClient  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError(
                "QUEUE_PROVIDER=azure_service_bus needs the azure-servicebus package. "
                "Install it with: poetry install --extras azure"
            ) from exc

        self._client = ServiceBusClient.from_connection_string(conn_str=self.connection_string)
        self._receiver = self._client.get_queue_receiver(
            queue_name=self.queue_name,
        )
        await self._receiver.__aenter__()

    async def _reconnect(self) -> None:
        await self.close()
        await self._connect()
        if self._message_map:
            logger.warning(
                "Discarding %d in-flight message(s) for %s: no longer completable/abandonable"
                " after reconnect",
                len(self._message_map),
                self.queue_name,
            )
        self._message_map.clear()
        logger.warning("ServiceBus queue reconnected after fatal error: %s", self.queue_name)

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

    async def receive(self, max_count: int = 10, wait_seconds: int = 5) -> list[QueueMessage]:
        try:
            raw_msgs = await self._receiver.receive_messages(
                max_message_count=max_count,
                max_wait_time=wait_seconds,
            )
            messages: list[QueueMessage] = []
            for raw in raw_msgs:
                try:
                    msg = QueueMessage.from_json_string(str(raw))
                    msg.message_id = raw.message_id or msg.message_id
                    msg.retry_count = raw.delivery_count or 0
                    self._message_map[msg.message_id] = raw
                    messages.append(msg)
                except Exception as exc:  # noqa: BLE001
                    logger.error("Failed to parse message from %s: %s", self.queue_name, exc)
                    await self._receiver.dead_letter_message(raw, reason="ParseError")
            return messages
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to receive from %s: %s", self.queue_name, exc)
            try:
                await self._reconnect()
            except Exception as reconnect_exc:  # noqa: BLE001
                logger.error("Failed to reconnect for %s: %s", self.queue_name, reconnect_exc)
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
