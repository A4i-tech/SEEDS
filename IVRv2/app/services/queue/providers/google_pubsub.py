"""
Dummy Google Pub/Sub provider implementation (async, SQS-like API).

This placeholder implements the same async surface as the AWSSQS provider
so it can be swapped in tests or during development without requiring
google-cloud-pubsub. Each method is a non-functional stub with
explanatory comments describing expected real behaviour.
"""
from __future__ import annotations

from typing import Any, Dict, List
import logging

from app.services.queue.base_queue_provider import BaseQueueProvider
from app.services.queue.models.queue_message import QueueMessage

logger = logging.getLogger(__name__)


class GooglePubSubQueueProvider(BaseQueueProvider):
    """Async, comment-only Google Pub/Sub provider matching SQS API surface.

    Methods are intentionally non-functional. Replace with a real
    implementation using google-cloud-pubsub when production behaviour
    is required.
    """

    def __init__(self, config: Dict[str, Any]):
        """Initialise provider from a config dict.

        Expected config keys (examples):
          - project_id
          - credentials (opaque)
          - topic_name
          - subscription_name
          - dlq_topic
        """
        super().__init__(config)
        self.project_id = config.get("project_id")
        self.credentials = config.get("credentials")
        self.topic_name = config.get("topic_name")
        self.subscription_name = config.get("subscription_name")
        self.dlq_topic = config.get("dlq_topic")

        # placeholders for actual clients (e.g. pubsub_v1.PublisherClient / SubscriberClient)
        self._publisher = None
        self._subscriber = None
        # simple message map to simulate receipt/ack handles during tests
        self._message_map: Dict[str, Any] = {}

    async def initialize(self) -> None:
        """Initialize Pub/Sub clients.

        Real implementation should create publisher/subscriber clients
        and ensure the topic/subscription exist. This stub only marks the
        provider as initialized.
        """
        # Example real code:
        # from Google.cloud import pubsub_v1
        # self._publisher = pubsub_v1.PublisherClient(credentials=self.credentials)
        # self._subscriber = pubsub_v1.SubscriberClient(credentials=self.credentials)
        # Ensure topic/subscription exist or create them.
        self._initialized = True
        logger.info("GooglePubSub provider initialized (dummy).")

    async def close(self) -> None:
        """Close any open clients and cleanup resources.

        Real implementation should close/stop clients.
        """
        # if self._publisher: self._publisher.transport.close()
        # if self._subscriber: self._subscriber.transport.close()
        self._publisher = None
        self._subscriber = None
        self._initialized = False
        logger.info("GooglePubSub provider closed (dummy).")

    async def send_message(self, message: QueueMessage) -> bool:
        """Publish a message to the configured topic.

        Args:
            message: QueueMessage instance to publish.

        Returns:
            bool: True if (dummy) publish succeeded.
        """
        # Real implementation would call self._publisher.publish(topic_path, message.data, **attributes)
        logger.info("(dummy) send_message called for topic %s", self.topic_name)
        return True

    async def receive_messages(self, max_messages: int = 10, wait_time_seconds: int = 5) -> List[QueueMessage]:
        """Pull messages from a subscription.

        Args:
            max_messages: maximum number of messages to return.
            wait_time_seconds: server-side wait time (long-poll semantics vary).

        Returns:
            List[QueueMessage]: empty list for the dummy provider.
        """
        # Real implementation might use streaming pull or synchronous pull
        # via subscriber.pull and convert messages to QueueMessage.
        logger.debug("(dummy) receive_messages called for subscription %s", self.subscription_name)
        return []

    async def delete_message(self, message: QueueMessage) -> bool:
        """Acknowledge / delete a message from the subscription.

        Args:
            message: QueueMessage instance to acknowledge.

        Returns:
            bool indicating success.
        """
        # Real impl would call subscriber.acknowledge with ack ids tracked when receiving.
        logger.debug("(dummy) delete_message called for message id %s", message.message_id)
        self._message_map.pop(message.message_id, None)
        return True

    async def return_message_to_queue(self, message: QueueMessage) -> bool:
        """Return a message back to the subscription/queue for reprocessing.

        For Pub/Sub this may mean modifying ack deadlines or simply not acking.
        This stub always returns True.
        """
        # Real implementation could call modify_ack_deadline or not acknowledge so it becomes available.
        logger.debug("(dummy) return_message_to_queue called for message id %s", message.message_id)
        return True

    async def move_dead_letter_queue(self, message: QueueMessage, reason: str) -> bool:
        """Move a message to a dead-letter topic.

        Args:
            message: QueueMessage to move to DLQ.
            reason: Reason for moving to DLQ.

        Returns:
            bool indicating success.
        """
        # Real implementation would publish the message to a dlq topic and ack the original.
        logger.warning("(dummy) move_dead_letter_queue called for message id %s with reason: %s", message.message_id, reason)
        self._message_map.pop(message.message_id, None)
        return True

    async def get_queue_depth(self) -> int:
        """Return an approximate number of messages pending.

        Pub/Sub does not provide a simple queue depth; real code may use
        Stackdriver metrics or the subscription's backlog estimate.
        This stub returns 0.
        """
        logger.debug("(dummy) get_queue_depth called for subscription %s", self.subscription_name)
        return 0

    async def purge_queue(self) -> bool:
        """Purge messages from the subscription/topic.

        Pub/Sub doesn't support purge; a real implementation would need
        to recreate the subscription or use admin APIs. This stub returns True.
        """
        logger.info("(dummy) purge_queue called for subscription %s", self.subscription_name)
        return True


__all__ = ["GooglePubSubQueueProvider"]
