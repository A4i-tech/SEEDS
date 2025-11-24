"""
Base processor class for Service Bus message processing.
Provides common functionality for all processor types.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Optional

from app.services.queue.models.queue_message import QueueMessage


class PermanentQueueError(Exception):
    """Raised when a queue message should not be retried and must go to DLQ."""

    pass


class SkipMessageError(Exception):
    """Raised when a processor should skip a message and return it to queue for other processors."""

    pass


class BaseProcessor(ABC):
    """
    Abstract base class for all Service Bus message processors.
    Provides centralized logging and common processing infrastructure.
    """

    def __init__(self):
        """Initialize the base processor with logging configuration."""
        self.class_name = self.__class__.__name__
        self._shutdown_event = asyncio.Event()
        self._task: Optional[asyncio.Task] = None
        self.logger = logging.getLogger(self.class_name)

    def log_info(self, message: str):
        """
        Log an informational message.

        Args:
            message: The message to log
        """
        self.logger.info(f"[{self.class_name}] {message}")

    def log_error(self, message: str, exc_info: bool = False):
        """
        Log an error message.

        Args:
            message: The error message to log
            exc_info: Whether to include exception information
        """
        self.logger.error(f"[{self.class_name}] {message}", exc_info=exc_info)

    def log_warning(self, message: str):
        """
        Log a warning message.

        Args:
            message: The warning message to log
        """
        self.logger.warning(f"[{self.class_name}] {message}")

    def log_debug(self, message: str):
        """
        Log a debug message.

        Args:
            message: The debug message to log
        """
        self.logger.debug(f"[{self.class_name}] {message}")

    @abstractmethod
    async def get_provider(self):
        """
        Get the queue provider for this processor.
        Must be implemented by subclasses.

        Returns:
            BaseQueueProvider: The queue provider instance
        """
        pass

    @abstractmethod
    async def process_message(self, message: QueueMessage):
        """
        Process a single message from the queue.
        Must be implemented by subclasses.

        Args:
            message: The message to process
        """
        pass

    async def start(self, batch_size: int = 10, max_wait_seconds: int = 5):
        """
        Start the message processing loop with graceful shutdown support.

        Args:
            batch_size: Maximum number of messages to receive per batch
            max_wait_seconds: Maximum time to wait for messages
        """
        print(
            f"INFO: [{self.class_name}] Starting processor with batch_size={batch_size}, max_wait={max_wait_seconds}s"
        )

        try:
            provider = await self.get_provider()
            if provider is None:
                raise RuntimeError("Provider is None - cannot start processor")

            print(
                f"INFO: [{self.class_name}] Provider obtained, entering message loop..."
            )

            while not self._shutdown_event.is_set():
                try:
                    print(f"DEBUG: [{self.class_name}] Waiting for messages...")
                    # Receive messages with timeout
                    messages = await asyncio.wait_for(
                        provider.receive_messages(batch_size, max_wait_seconds),
                        timeout=max_wait_seconds + 1,
                    )

                    if not messages:
                        print(f"DEBUG: [{self.class_name}] No messages received")
                        continue

                    print(
                        f"INFO: [{self.class_name}] Received {len(messages)} messages"
                    )

                    # Process messages concurrently with ack handling
                    tasks = [self._handle_message(provider, msg) for msg in messages]
                    await asyncio.gather(*tasks, return_exceptions=True)

                except asyncio.TimeoutError:
                    self.log_debug("Receive timeout, continuing...")
                    continue
                except Exception as e:
                    self.log_error(f"Error in processing loop: {e}", exc_info=True)
                    await asyncio.sleep(1)  # Brief pause before retrying

        except Exception as e:
            self.log_error(f"Fatal error in processor: {e}", exc_info=True)
            raise
        finally:
            self.log_info("Processor stopped")

    async def _handle_message(self, provider, message: QueueMessage):
        """Process a single message and handle queue acknowledgements."""
        try:
            await self.process_message(message)
            deleted = await provider.delete_message(message)
            if not deleted:
                self.log_error(
                    f"Failed to delete message {message.message_id} after successful processing"
                )
        except SkipMessageError:
            # Message not for this processor, return to queue for others
            print(
                f"DEBUG: [{self.class_name}] Returning skipped message to queue: {message.message_id}"
            )
            returned = await provider.return_message_to_queue(message)
            if not returned:
                print(
                    f"ERROR: [{self.class_name}] Failed to return skipped message {message.message_id} to queue"
                )
        except PermanentQueueError as e:
            self.log_warning(f"Permanent failure for message {message.message_id}: {e}")
            moved = await provider.move_dead_letter_queue(message, reason=str(e))
            if not moved:
                self.log_error(
                    f"Failed to move message {message.message_id} to DLQ after permanent failure"
                )
            deleted = await provider.delete_message(message)
            if not deleted:
                self.log_error(
                    f"Failed to delete message {message.message_id} after successful processing"
                )
        except Exception as e:
            self.log_error(
                f"Error processing message {message.message_id}: {e}", exc_info=True
            )
            returned = await provider.return_message_to_queue(message)
            if not returned:
                self.log_error(
                    f"Failed to return message {message.message_id} to queue after error"
                )

    def start_background(self, batch_size: int = 10, max_wait_seconds: int = 5):
        """
        Start the processor in the background and return immediately.

        Args:
            batch_size: Maximum number of messages to receive per batch
            max_wait_seconds: Maximum time to wait for messages

        Returns:
            asyncio.Task: The background task
        """
        if self._task is not None and not self._task.done():
            self.log_warning("Processor already running")
            return self._task

        self._task = asyncio.create_task(self.start(batch_size, max_wait_seconds))
        self.log_info("Background task started")
        return self._task

    async def shutdown(self, timeout: int = 30):
        """
        Trigger graceful shutdown of the processor with timeout.

        Args:
            timeout: Maximum seconds to wait for graceful shutdown before cancelling
        """
        self.log_info(f"Shutdown requested (timeout={timeout}s)")
        self._shutdown_event.set()

        if self._task is None or self._task.done():
            self.log_info("No active task to shutdown")
            return

        try:
            # Wait for task to complete gracefully
            await asyncio.wait_for(self._task, timeout=timeout)
            self.log_info("Graceful shutdown completed")
        except asyncio.TimeoutError:
            self.log_warning(f"Shutdown timeout after {timeout}s, cancelling task")
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                self.log_info("Task cancelled successfully")
        except Exception as e:
            self.log_error(f"Error during shutdown: {e}", exc_info=True)
