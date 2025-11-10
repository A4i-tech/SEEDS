from app.services.queue.base_queue_provider import BaseQueueProvider
from app.services.queue.models.queue_message import QueueMessage
from typing import List, Dict
from collections import deque
import asyncio
import logging
import uuid

logger = logging.getLogger(__name__)

class InMemoryQueueProvider(BaseQueueProvider):
    """
    In-memory implementation of the BaseQueueProvider.
    Handles sending and receiving messages using an in-memory queue.
    """

    # class-level queue to simulate message storage
    _queues: Dict[str, deque] = {}
    _dlqs: Dict[str, deque] = {}

    def __init__(self, config: dict):
        super().__init__(config)
        self.queue_name = config.get("queue_name", "default_queue")
        self.max_size = config.get("max_size", 100)
        if self.queue_name not in InMemoryQueueProvider._queues:
            InMemoryQueueProvider._queues[self.queue_name] = deque(maxlen=self.max_size)
            InMemoryQueueProvider._dlqs[self.queue_name] = deque(maxlen=self.max_size)

    @property
    def _queue(self) -> deque:
        return InMemoryQueueProvider._queues[self.queue_name]

    @property
    def _dlq(self) -> deque:
        return InMemoryQueueProvider._dlqs[self.queue_name]

    async def initialize(self) -> None:
        """Initializes the in-memory queue provider."""
        self._initialized = True
        logger.info(f"In-memory queue '{self.queue_name}' initialized.")

    async def close(self) -> None:
        """Closes the in-memory queue provider."""
        self._initialized = False
        logger.info(f"In-memory queue '{self.queue_name}' closed.")

    async def send_message(self, message: QueueMessage) -> bool:
        """
        Sends a message to the in-memory queue.
        :param message:
        :return:
        """
        try:
            if not message.message_id:
                message.message_id = str(uuid.uuid4())
            self._queue.append(message)
            logger.info(f"Message sent to in-memory queue '{self.queue_name}': {message}")
            return True
        except Exception as e:
            logger.error(f"Failed to send message to in-memory queue '{self.queue_name}': {e}")
            return False

    async def receive_messages(
        self,
        max_messages: int = 10,
        wait_time_seconds: int = 5,
        ) -> List[QueueMessage]:
        """
        Receives messages from the in-memory queue.
        :param max_messages:
        :param wait_time_seconds:
        :return:
        """
        try:
            messages = []
            start_time = asyncio.get_event_loop().time()

            while len(messages) < max_messages:
                if len(self._queue) > 0:
                    messages.append(self._queue.popleft())
                elif asyncio.get_event_loop().time() - start_time < wait_time_seconds:
                    await asyncio.sleep(0.1)
                else:
                    break
            return messages
        except Exception as e:
            logger.error(f"Failed to receive messages from in-memory queue '{self.queue_name}': {e}")
            return []

    async def delete_message(self, message: QueueMessage) -> bool:
        """Delete message (no-op for in-memory, already removed in receive)"""
        logger.debug(f"Message deleted (no-op): {message.message_id}")
        return True

    async def return_message_to_queue(self, message: QueueMessage) -> bool:
        """Returns a message back to the in-memory queue."""
        try:
            self._queue.appendleft(message)
            logger.info(f"Message returned to in-memory queue '{self.queue_name}': {message.message_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to return message to in-memory queue '{self.queue_name}': {e}")
            return False

    async def move_dead_letter_queue(self, message: QueueMessage, reason: str) -> bool:
        """Move message to in-memory DLQ"""
        try:
            message.metadata['dlq_reason'] = reason
            self._dlq.append(message)
            logger.warning(f"Message moved to DLQ: {message.message_id}, Reason: {reason}")
            return True
        except Exception as e:
            logger.error(f"Failed to move message to DLQ: {str(e)}")
            return False

    async def get_queue_depth(self) -> int:
        """Gets the current depth of the in-memory queue."""
        return len(self._queue)

    async def purge_queue(self) -> bool:
        """Purge all messages from queue"""
        try:
            count = len(self._queue)
            self._queue.clear()
            logger.info(f"Purged {count} messages from in-memory queue")
            return True
        except Exception as e:
            logger.error(f"Failed to purge queue: {str(e)}")
            return False