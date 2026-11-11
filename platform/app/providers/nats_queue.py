from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

import nats
from nats.errors import TimeoutError as NatsTimeout
from nats.js.api import ConsumerConfig, RetentionPolicy, StorageType, StreamConfig
from nats.js.errors import NotFoundError

from app.providers.service_bus import QueueMessage

if TYPE_CHECKING:
    from app.platform.settings import Settings

logger = logging.getLogger(__name__)

MIN_SERVER_VERSION = (2, 10)


class _NatsQueueHandle:
    def __init__(self, settings: Settings, queue_name: str) -> None:
        self.settings = settings
        self.queue_name = queue_name
        self.dlq_subject = f"{queue_name}.dlq"
        self._nc = None
        self._js = None
        self._sub = None
        self._message_map: dict[str, Any] = {}

    async def initialize(self) -> None:
        settings = self.settings
        self._nc = await nats.connect(
            settings.nats_url,
            user_credentials=settings.nats_creds_file or None,
            max_reconnect_attempts=-1,
        )
        version = self._nc.connected_server_version
        if (version.major, version.minor) < MIN_SERVER_VERSION:
            raise RuntimeError(
                f"NATS server {version.major}.{version.minor}.{version.patch} is too old. "
                f"JetStream queues need NATS {MIN_SERVER_VERSION[0]}.{MIN_SERVER_VERSION[1]} or newer."
            )
        self._js = self._nc.jetstream()
        await self._ensure_stream()
        await self._js.add_consumer(
            settings.nats_stream,
            ConsumerConfig(
                durable_name=self.queue_name,
                ack_wait=settings.nats_ack_wait_seconds,
                filter_subject=self.queue_name,
            ),
        )
        self._sub = await self._js.pull_subscribe(
            self.queue_name, durable=self.queue_name, stream=settings.nats_stream
        )
        logger.info("NATS queue initialized: %s", self.queue_name)

    async def _ensure_stream(self) -> None:
        settings = self.settings
        try:
            await self._js.stream_info(settings.nats_stream)
        except NotFoundError:
            queues = [
                settings.call_webhook_queue_name,
                settings.dtmf_input_queue_name,
                settings.call_event_queue_name,
                settings.sync_jobs_queue_name,
            ]
            await self._js.add_stream(
                StreamConfig(
                    name=settings.nats_stream,
                    subjects=queues + [f"{q}.dlq" for q in queues],
                    retention=RetentionPolicy.WORK_QUEUE,
                    storage=StorageType.FILE,
                )
            )

    async def close(self) -> None:
        if self._nc:
            await self._nc.close()
        self._nc = self._js = self._sub = None

    async def send(self, message: QueueMessage) -> bool:
        try:
            await self._js.publish(
                self.queue_name,
                message.to_json_string().encode(),
                headers={"Nats-Msg-Id": message.message_id},
            )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to send to %s: %s", self.queue_name, exc)
            return False

    async def receive(self, max_count: int = 10, wait_seconds: int = 5) -> list[QueueMessage]:
        try:
            raw_msgs = await self._sub.fetch(max_count, timeout=wait_seconds)
        except NatsTimeout:
            return []
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to receive from %s: %s", self.queue_name, exc)
            await asyncio.sleep(0.1)
            return []
        messages: list[QueueMessage] = []
        for raw in raw_msgs:
            try:
                msg = QueueMessage.from_json_string(raw.data.decode())
            except Exception as exc:  # noqa: BLE001
                logger.error("Failed to parse message from %s: %s", self.queue_name, exc)
                await self._publish_dlq(raw, f"seq-{raw.metadata.sequence.stream}", "ParseError")
                await raw.term()
                continue
            msg.retry_count = raw.metadata.num_delivered - 1
            self._message_map[msg.message_id] = raw
            if raw.metadata.num_delivered > self.settings.azure_service_bus_max_retries:
                await self.dead_letter(msg, "MaxDeliveryCountExceeded")
                continue
            messages.append(msg)
        return messages

    async def complete(self, message: QueueMessage) -> bool:
        raw = self._message_map.pop(message.message_id, None)
        if raw is None:
            return False
        try:
            await raw.ack_sync()
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to complete message %s: %s", message.message_id, exc)
            return False

    async def abandon(self, message: QueueMessage) -> bool:
        raw = self._message_map.pop(message.message_id, None)
        if raw is None:
            return False
        try:
            await raw.nak()
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to abandon message %s: %s", message.message_id, exc)
            return False

    async def _publish_dlq(self, raw: Any, msg_id: str, reason: str) -> None:
        await self._js.publish(
            self.dlq_subject,
            raw.data,
            headers={"Nats-Msg-Id": f"{msg_id}-dlq", "Dead-Letter-Reason": reason},
        )

    async def dead_letter(self, message: QueueMessage, reason: str) -> bool:
        raw = self._message_map.pop(message.message_id, None)
        if raw is None:
            return False
        try:
            await self._publish_dlq(raw, message.message_id, reason)
            await raw.term()
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to DLQ message %s: %s", message.message_id, exc)
            return False
