import asyncio
from abc import ABC, abstractmethod
from typing import List, Optional, Callable, Awaitable
from app.services.queue.models.queue_message import QueueMessage
import logging

logger = logging.getLogger(__name__)

class BaseQueueProvider(ABC):
    """
    Abstract base class for queue providers.
    Defines the interface for queue operations.
    """

    def __init__(self, config: dict):
        """
        Initialize the queue provider.
        Args:
            config: dict: Configuration dictionary for the queue provider.
        """
        self.config = config
        self._initialized = False

    @abstractmethod
    def validate_configuration(self) -> None:
        """
        Validate the configuration for the queue provider.
        Should check for mandatory configuration keys and raise ValueError if invalid.
        Raises:
            ValueError: If required configuration keys are missing or invalid.
        """
        pass

    @abstractmethod
    async def initialize(self) -> None:
        """
        Initialize the queue provider.
        Optionally calls validate_configuration() to ensure config is valid before initialization.
        """
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close the queue provider and release any resources."""
        pass

    @abstractmethod
    async def send_message(self, message: QueueMessage) -> bool:
        """
        Send a message to the queue.
        Args:
            message: QueueMessage: The message to send.
        Returns:
            bool: True if the message was sent successfully, False otherwise.
        """
        pass

    @abstractmethod
    async def receive_messages(
        self,
        max_messages: int = 10,
        wait_time_seconds: int = 5,
        ) -> List[QueueMessage]:
        """
        Receive messages from the queue.
        :param max_messages:
        :param wait_time_seconds:
        :return:
        List[QueueMessage]: List of received messages.
        """
        pass

    @abstractmethod
    async def delete_message(self, message: QueueMessage) -> bool:
        """
        Delete a message from the queue.
        Args:
            message: QueueMessage: The message to delete.
        Returns:
            bool: True if the message was deleted successfully, False otherwise.
        """
        pass

    @abstractmethod
    async def return_message_to_queue(self, message: QueueMessage) -> bool:
        """
        Return a message back to the queue for reprocessing.
        Args:
            message: QueueMessage: The message to return.
        Returns:
            bool: True if the message was returned successfully, False otherwise.
        """
        pass

    @abstractmethod
    async def get_queue_depth(self) -> int:
        """
        Get the current depth of the queue.
        Returns:
            int: The number of messages currently in the queue.
        """
        pass

    @abstractmethod
    async def purge_queue(self) -> bool:
        """
        Purge all messages from the queue.
        Returns:
            bool: True if the queue was purged successfully, False otherwise.
        """
        pass

    @abstractmethod
    async def move_dead_letter_queue(self, message: QueueMessage, reason: str) -> bool:
        """
        Move a message to the dead-letter queue.
        Args:
            message: QueueMessage: The message to move.
            reason: str: The reason for moving the message to the dead-letter queue.
        Returns:
            bool: True if the message was moved successfully, False otherwise.
        """
        pass

    async def start_consuming(
        self,
        message_handler: Callable[[QueueMessage], Awaitable[bool]],
        wait_time_seconds: int = 5,
        max_messages: int = 10,
    ) -> None:
        """
        Start consuming messages from the queue and processing them with the provided handler.
        Args:
            message_handler: Callable[[QueueMessage], Awaitable[None]]: The async function to process each message.
            wait_time_seconds: int: Time in seconds to wait between polling the queue.
            max_messages: int: Maximum number of messages to retrieve in each poll.
        """
        if not self._initialized:
            await self.initialize()
            self._initialized = True

        logger.info("Starting message consumption loop.")

        while True:
            try:
                messages = await self.receive_messages(max_messages, wait_time_seconds)

                for message in messages:
                    try:
                        success = await message_handler(message)
                        if success:
                            await self.delete_message(message)
                        else:
                            message.retry_count += 1

                            # Move to DLQ if retry limit exceeded
                            max_retries = self.config.get("max_retries", 5)
                            if message.retry_count > max_retries:
                                await self.move_dead_letter_queue(message, "Max retries exceeded")
                            else:
                                await self.return_message_to_queue(message)
                    except Exception as e:
                        logger.error(f"Error processing message {message.message_id}: {e}")
                        message.retry_count += 1
                        max_retries = self.config.get("max_retries", 5)
                        if message.retry_count > max_retries:
                            await self.move_dead_letter_queue(message, "Max retries exceeded due to exception")
                        else:
                            await self.return_message_to_queue(message)
            except Exception as e:
                logger.error(f"Error receiving messages: {e}")
            await asyncio.sleep(wait_time_seconds)