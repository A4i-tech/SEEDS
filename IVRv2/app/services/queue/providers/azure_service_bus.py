import logging
from typing import List, Optional

from azure.servicebus import ServiceBusMessage
from azure.servicebus.aio import ServiceBusClient, ServiceBusSender, ServiceBusReceiver

from app.services.queue.base_queue_provider import BaseQueueProvider
from app.services.queue.models.queue_message import QueueMessage

logger = logging.getLogger(__name__)

class AzureServiceBusQueueProvider(BaseQueueProvider):
    """
    Azure Service Bus implementation of the BaseQueueProvider.
    Handles sending and receiving messages to/from Azure Service Bus.
    """

    def __init__(self, config: dict):
        super().__init__(config)
        self.connection_string = config.get("connection_string")
        self.queue_name = config.get("queue_name")
        self.dlq_name = config.get("dlq_name", f"{self.queue_name}-dlq")
        self._client: Optional[ServiceBusClient] = None
        self._sender: Optional[ServiceBusSender] = None
        self._receiver: Optional[ServiceBusReceiver] = None
        self._message_map = {}

    async def initialize(self):
        """Initializes the Service Bus client and sender."""
        if not self.connection_string or not self.queue_name:
            raise ValueError("Service Bus connection string or queue name is not set.")

        self._client = ServiceBusClient.from_connection_string(conn_str=self.connection_string)
        self._sender = self._client.get_queue_sender(queue_name=self.queue_name)
        self._receiver = self._client.get_queue_receiver(queue_name=self.queue_name)
        self._initialized = True
        logger.info("Service Bus client and sender initialized.")

    async def close(self):
        """Closes the Service Bus client."""
        if self._sender:
            await self._sender.close()
        if self._receiver:
            await self._receiver.close()
        if self._client:
            await self._client.close()
        self._initialized = False
        logger.info("Service Bus client closed.")

    async def send_message(self, message: QueueMessage) -> bool:
        """
        Sends a message to the Service Bus queue.
        :param message:
        :return:
        """
        try:
            sb_message = ServiceBusMessage(
                body=message.to_json_string(),
                content_type="application/json",
                message_id=message.message_id,
                correlation_id=message.correlation_id
            )
            await self._sender.send_messages(sb_message)
            logger.info(f"Message sent to Service Bus: {message}")
            return True
        except Exception as e:
            logger.error(f"Failed to send message to Service Bus: {e}")
            return False

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
        try:
            received = await self._receiver.receive_messages(
                max_message_count=max_messages,
                max_wait_time=wait_time_seconds
            )
            messages = []
            for sb_message in received:
                try:
                    queue_msg = QueueMessage.from_json_string(str(sb_message))
                    queue_msg.message_id=sb_message.message_id
                    # store the original message for later deletion
                    self._message_map[queue_msg.message_id] = sb_message
                    messages.append(queue_msg)
                except Exception as e:
                    logger.error(f"Failed to parse message from Service Bus: {e}")
                    await self._receiver.dead_letter_message(
                        sb_message,
                        reason="ParsingError",
                        error_description=str(e)
                    )
            return messages
        except Exception as e:
            logger.error(f"Failed to receive messages from Service Bus: {e}")
            return []

    async def delete_message(self, message: QueueMessage) -> bool:
        """
        Delete a message from the queue.
        Args:
            message: QueueMessage: The message to delete.
        Returns:
            bool: True if the message was deleted successfully, False otherwise.
        """

        try:
            sb_message = self._message_map.get(message.message_id)
            if not sb_message:
                logger.error(f"Message with ID {message.message_id} not found for deletion.")
                return False
            await self._receiver.complete_message(sb_message)
            del self._message_map[message.message_id]
            logger.debug(f"Message with ID {message.message_id} deleted from Service Bus.")
            return True
        except Exception as e:
            logger.error(f"Failed to delete message from Service Bus: {e}")
            return False

    async def return_message_to_queue(self, message: QueueMessage) -> bool:
        """
        Return a message back to the queue for reprocessing.
        Args:
            message: QueueMessage: The message to return.
        Returns:
            bool: True if the message was returned successfully, False otherwise.
        """
        try:
            sb_message = self._message_map.get(message.message_id)
            if not sb_message:
                logger.error(f"Message with ID {message.message_id} not found for return.")
                return False
            await self._receiver.abandon_message(sb_message)
            del self._message_map[message.message_id]
            logger.info(f"Message with ID {message.message_id} returned to queue for reprocessing.")
            return True
        except Exception as e:
            logger.error(f"Failed to return message to queue: {e}")
            return False

    async def move_dead_letter_queue(self, message: QueueMessage, reason: str) -> bool:
        """
        Move a message to the dead-letter queue.
        Args:
            message: QueueMessage: The message to move.
            reason: str: The reason for moving the message to the DLQ.
        Returns:
            bool: True if the message was moved successfully, False otherwise.
        """
        try:
            sb_message = self._message_map.get(message.message_id)
            if not sb_message:
                logger.error(f"Message with ID {message.message_id} not found for DLQ move.")
                return False
            await self._receiver.dead_letter_message(
                sb_message,
                reason="MaxRetriesExceeded",
                error_description=reason
            )
            del self._message_map[message.message_id]
            logger.warning(f"Message with ID {message.message_id} moved to DLQ.")
            return True
        except Exception as e:
            logger.error(f"Failed to move message to DLQ: {e}")
            return False

    async def get_queue_depth(self) -> int:
        """
        Get the current depth of the queue.
        Returns:
            int: The number of messages currently in the queue.
        """
        # Azure Service Bus does not provide a direct way to get queue depth via SDK.
        # This would typically be done via Azure Monitor or Management APIs.
        logger.warning("Getting queue depth is not implemented.")
        return -1  # Placeholder value

    async def purge_queue(self) -> bool:
        """
        Purge all messages from the queue.
        Returns:
            bool: True if the queue was purged successfully, False otherwise.
        """
        try:
            count = 0
            while True:
                messages = await self.receive_messages(max_messages=100, wait_time_seconds=2)
                if not messages:
                    break
                for message in messages:
                    await self._receiver.complete_message(message)
                    count += 1
            logger.info(f"Purged {count} messages from the queue.")
            return True
        except Exception as e:
            logger.error(f"Failed to purge queue: {e}")
            return False