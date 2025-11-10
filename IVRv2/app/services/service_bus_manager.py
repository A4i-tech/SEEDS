import logging
import os
from typing import Optional, Dict, Any


from app.services.queue import BaseQueueProvider, QueueFactory, MessageType, QueueMessage

logger = logging.getLogger(__name__)
class ServiceBusManager:
    """
    Manages Service Bus connections and operations for IVR call processing
    Handles sending and receiving messages to/from the Service Bus asynchronously.
    """

    def __init__(self):
        self._provider: BaseQueueProvider = None

    async def initialize(self):
        """Initializes the Service Bus client and sender."""
        self._provider = QueueFactory.create_queue_provider(os.getenv("PROVIDER_TYPE", "azure"))
        await self._provider.initialize()
        logger.info("Service Bus client and sender initialized.")

    async def close(self):
        """Closes the Service Bus client."""
        if self._provider:
            await self._provider.close()
        logger.info("Service Bus client closed.")

    async def send_message(self, message_type: MessageType, payload: Dict[str, Any]) -> bool:
        """
        Sends a message to the Service Bus.
        :param message_type:
        :param payload:
        :return:
        bool: True if the message was sent successfully, False otherwise.
        """
        message = QueueMessage(type=message_type, payload=payload)
        return await self._provider.send_message(message)


    async def start_call_webhook_message(self, phone_number: str, call_log_id: str):
        """
        Sends a start call webhook message to the Service Bus.
        Args:
            phone_number (str): The phone number associated with the call.
            call_log_id (str): The unique identifier for the call log.
        Returns:
            bool: True if the message was sent successfully, False otherwise.
        """
        payload = {
            "phone_number": phone_number,
            "call_log_id": call_log_id
        }
        return await self.send_message(MessageType.CALL_WEBHOOK, payload)

    async def send_dtmf_input_message(self, conversation_uuid: str, digits: str, input_data: Dict[str, Any]):
        """
        Sends a DTMF input message to the Service Bus.
        :param conversation_uuid:
        :param digits:
        :param input_data:
        """
        payload = {
            "conversation_uuid": conversation_uuid,
            "digits": digits,
            "input_data": input_data
        }
        return await self.send_message(MessageType.DTMF_INPUT, payload)

    async def send_event_message(self, event_data: Dict[str, Any]):
        """
        Sends an event message to the Service Bus.
        :param event_data:
        """
        message_data = {
            "event_data": event_data
        }
        return await self.send_message(MessageType.CALL_EVENT,message_data)

    async def get_qeueue_depth(self) -> int:
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