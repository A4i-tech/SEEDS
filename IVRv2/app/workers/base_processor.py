"""
Base processor class for Service Bus message processing.
Provides common functionality for all processor types.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Optional

from app.services.queue.models.queue_message import QueueMessage


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
        self.log_info(
            f"Starting processor with batch_size={batch_size}, max_wait={max_wait_seconds}s"
        )

        try:
            provider = await self.get_provider()
            if provider is None:
                raise RuntimeError("Provider is None - cannot start processor")

            while not self._shutdown_event.is_set():
                try:
                    # Receive messages with timeout
                    messages = await asyncio.wait_for(
                        provider.receive_messages(batch_size, max_wait_seconds),
                        timeout=max_wait_seconds + 1,
                    )

                    if not messages:
                        self.log_debug("No messages received")
                        continue

                    self.log_info(f"Received {len(messages)} messages")

                    # Process messages concurrently
                    tasks = [self.process_message(msg) for msg in messages]
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
