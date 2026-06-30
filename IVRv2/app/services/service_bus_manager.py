import logging
import os
import asyncio
from typing import Optional, Dict, Any

from app.services.queue import (
    BaseQueueProvider,
    QueueFactory,
    MessageType,
    QueueMessage,
)
from app.settings import settings


logger = logging.getLogger(__name__)


class ServiceBusManager:
    """
    Manages three Service Bus connections and operations for IVR call processing
    Handles sending and receiving messages to/from the Service Bus asynchronously.
    """

    def __init__(self):
        self._call_webhook_provider: Optional[BaseQueueProvider] = None
        self._dtmf_input_provider: Optional[BaseQueueProvider] = None
        self._call_event_provider: Optional[BaseQueueProvider] = None
        self._initialized: bool = False
        self._provider: BaseQueueProvider = None

    async def initialize(self):
        """Initializes the three Service Bus client and sender."""
        if self._initialized:
            logger.warning("Service Bus Manager is already initialized.")
            return
        logger.info("Initialising ServiceBusManager with three queues...")
        logger.info(f"Base queue name: {settings.azure_service_bus_queue_name}")
        logger.info(f"Call webhook queue: {settings.call_webhook_queue_name}")
        logger.info(f"DTMF input queue: {settings.dtmf_input_queue_name}")
        logger.info(f"Call event queue: {settings.call_event_queue_name}")
        base_config = {
            "connection_string": settings.azure_service_bus_connection_string,
        }

        # Create three providers
        self._call_webhook_provider = QueueFactory.create_queue_provider(
            provider_type=settings.provider_type,
            queue_name=settings.call_webhook_queue_name,
        )

        self._dtmf_input_provider = QueueFactory.create_queue_provider(
            provider_type=settings.provider_type,
            queue_name=settings.dtmf_input_queue_name,
        )

        self._call_event_provider = QueueFactory.create_queue_provider(
            provider_type=settings.provider_type,
            queue_name=settings.call_event_queue_name,
        )

        # intialize all the providers concurrently
        await asyncio.gather(
            self._call_webhook_provider.initialize(),
            self._dtmf_input_provider.initialize(),
            self._call_event_provider.initialize(),
        )

        self._initialized = True
        logger.info("Service Bus client and sender initialized.")

    async def close(self):
        """Closes all queues."""
        logger.info("Closing Service Bus clients...")
        close_tasks = []
        if self._call_webhook_provider:
            close_tasks.append(self._call_webhook_provider.close())
        if self._dtmf_input_provider:
            close_tasks.append(self._dtmf_input_provider.close())
        if self._call_event_provider:
            close_tasks.append(self._call_event_provider.close())
        await asyncio.gather(*close_tasks, return_exceptions=True)
        self._initialized = False
        logger.info("Service Bus clients closed.")

    # Provider getters
    def get_call_webhook_provider(self) -> BaseQueueProvider:
        """Get the call webhook queue provider"""
        if not self._call_webhook_provider:
            raise RuntimeError("Call webhook provider is not initialized.")
        return self._call_webhook_provider

    def get_dtmf_input_provider(self) -> BaseQueueProvider:
        """Get the DTMF input queue provider"""
        if not self._dtmf_input_provider:
            raise RuntimeError("DTMF input provider is not initialized.")
        return self._dtmf_input_provider

    def get_call_event_provider(self) -> BaseQueueProvider:
        """Get the call event queue provider"""
        if not self._call_event_provider:
            raise RuntimeError("Call event provider is not initialized.")
        return self._call_event_provider

    # Message sending methods
    async def send_call_webhook(self, payload: dict) -> bool:
        """
        Sends a call webhook message to the Service Bus.
        :param payload:
        :return:
        bool: True if the message was sent successfully, False otherwise.
        """
        message = QueueMessage(type=MessageType.CALL_WEBHOOK, payload=payload)
        return await self._call_webhook_provider.send_message(message)

    async def send_dtmf_input(self, payload: dict) -> bool:
        """
        Sends a DTMF input message to the Service Bus.
        :param payload:
        :return:
        bool: True if the message was sent successfully, False otherwise.
        """
        message = QueueMessage(type=MessageType.DTMF_INPUT, payload=payload)
        return await self._dtmf_input_provider.send_message(message)

    async def send_call_event(self, payload: dict) -> bool:
        """
        Sends a call event message to the Service Bus.
        :param payload:
        :return:
        bool: True if the message was sent successfully, False otherwise.
        """
        message = QueueMessage(type=MessageType.CALL_EVENT, payload=payload)
        return await self._call_event_provider.send_message(message)

    async def get_queue_depth(self) -> int:
        """
        Gets the current depth of the Service Bus queue.
        :return: int: The number of messages currently in the queue.
        """
        return await self._provider.get_queue_depth()

    async def purge_queue(self) -> bool:
        """
        Purges all messages from the Service Bus queue.
        :return: bool: True if the queue was purged successfully, False otherwise.
        """
        return await self._provider.purge_queue()


# Global instance
service_bus_manager = ServiceBusManager()
