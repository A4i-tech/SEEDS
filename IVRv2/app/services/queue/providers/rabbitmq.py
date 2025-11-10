"""
Dummy RabbitMQ provider implementation.

This file provides a placeholder class with method stubs and comments
so other parts of the application can import and use the provider
interface during development or tests without requiring a real RabbitMQ
server or pika dependency.

Replace with a real implementation using pika (or aio-pika) when
production behaviour is required.
"""
from __future__ import annotations

from typing import Any, Dict, List
import logging

from app.services.queue.base_queue_provider import BaseQueueProvider
from app.services.queue.models.queue_message import QueueMessage

logger = logging.getLogger(__name__)


class RabbitMQProvider(BaseQueueProvider):
    """A minimal, comment-only provider skeleton for RabbitMQ that
    exposes the same async API surface as AWSSQSQueueProvider.

    Methods are async and intentionally non-functional placeholders.
    Replace with a real aio-pika / pika implementation when needed.
    """

    def __init__(self, config: Dict[str, Any]):
        """Initialise the provider with a config dictionary to match other providers.

        Expected keys in config (examples):
            - host
            - port
            - username
            - password
            - queue_name
            - dlq_name
        """
        super().__init__(config)
        # read configuration values similar to AWSSQS provider
        self.host = config.get("host", "localhost")
        self.port = config.get("port", 5672)
        self.username = config.get("username")
        self.password = config.get("password")
        self.queue_name = config.get("queue_name")
        self.dlq_name = config.get("dlq_name")

        # placeholders for connection/channel (e.g. aio-pika connection/channel)
        self._connection = None
        self._channel = None
        # simple message map to simulate receipt handles if needed in tests
        self._message_map: Dict[str, Any] = {}

    async def initialize(self) -> None:
        """Initializes the RabbitMQ connection/channel.

        Real implementation would connect to RabbitMQ using aio-pika or pika
        and prepare a channel and any required queues/exchanges. This is a
        no-op placeholder that marks the provider as initialized.
        """
        # Example (aio-pika):
        # self._connection = await aio_pika.connect_robust(...)
        # self._channel = await self._connection.channel()
        self._initialized = True
        logger.info("RabbitMQ provider initialized (dummy).")

    async def close(self) -> None:
        """Close any open connection/channel and cleanup resources.

        Real implementation should close channel then connection.
        """
        # if self._channel: await self._channel.close()
        # if self._connection: await self._connection.close()
        self._channel = None
        self._connection = None
        self._initialized = False
        logger.info("RabbitMQ provider closed (dummy).")

    async def send_message(self, message: QueueMessage) -> bool:
        """Send a message to the configured queue.

        Args:
            message: QueueMessage instance to send.

        Returns:
            bool indicating whether the (dummy) send succeeded.
        """
        # Real implementation would publish to an exchange or default '' with routing_key=self.queue_name
        # and optionally include message attributes/headers.
        logger.info("(dummy) send_message called for queue %s", self.queue_name)
        return True

    async def receive_messages(self, max_messages: int = 10, wait_time_seconds: int = 5) -> List[QueueMessage]:
        """Receive / pull messages from the queue.

        Args:
            max_messages: maximum number of messages to return.
            wait_time_seconds: long-poll wait time (semantics vary by broker).

        Returns:
            List of QueueMessage instances (empty for this dummy provider).
        """
        # Real implementation would consume or basic_get messages and convert
        # them to QueueMessage objects. Here we return an empty list.
        logger.debug("(dummy) receive_messages called for queue %s", self.queue_name)
        return []

    async def delete_message(self, message: QueueMessage) -> bool:
        """Delete / acknowledge a processed message.

        Args:
            message: QueueMessage that was processed.

        Returns:
            bool indicating success.
        """
        # Real implementation would ack using delivery tag or delete from broker.
        logger.debug("(dummy) delete_message called for message id %s", message.message_id)
        # Simulate removal from internal map if present
        self._message_map.pop(message.message_id, None)
        return True

    async def return_message_to_queue(self, message: QueueMessage) -> bool:
        """Return a message back to the queue for reprocessing.

        Args:
            message: QueueMessage to requeue.

        Returns:
            bool indicating success.
        """
        # Real implementation might requeue by rejecting without requeue=False or changing visibility.
        logger.debug("(dummy) return_message_to_queue called for message id %s", message.message_id)
        return True

    async def move_dead_letter_queue(self, message: QueueMessage, reason: str) -> bool:
        """Move a message to a dead-letter queue (DLQ).

        Args:
            message: QueueMessage to move.
            reason: Reason for moving to DLQ.

        Returns:
            bool indicating success.
        """
        # Real implementation would publish the message to a DLQ exchange/queue and remove the original.
        logger.warning("(dummy) move_dead_letter_queue called for message id %s with reason: %s", message.message_id, reason)
        # Simulate deletion from main queue
        self._message_map.pop(message.message_id, None)
        return True

    async def get_queue_depth(self) -> int:
        """Return an approximate depth/number of messages in the queue.

        Returns:
            int depth, or -1 if unavailable.
        """
        # Real implementation would query queue metrics via management API or broker-specific call.
        logger.debug("(dummy) get_queue_depth called for queue %s", self.queue_name)
        return 0

    async def purge_queue(self) -> bool:
        """Purge all messages from the queue.

        Returns:
            bool indicating success.
        """
        # Real implementation should call queue_purge via the AMQP client or management API.
        logger.info("(dummy) purge_queue called for queue %s", self.queue_name)
        return True


__all__ = ["RabbitMQProvider"]
