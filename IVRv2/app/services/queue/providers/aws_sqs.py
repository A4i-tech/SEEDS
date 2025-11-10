import aioboto3
from app.services.queue.base_queue_provider import BaseQueueProvider
from app.services.queue.models.queue_message import QueueMessage
from typing import List, Optional
import logging
import json

logger = logging.getLogger(__name__)

class AWSSQSQueueProvider(BaseQueueProvider):
    """
    AWS SQS implementation of the BaseQueueProvider.
    Handles sending and receiving messages to/from AWS SQS.
    """

    def __init__(self, config: dict):
        super().__init__(config)
        self.queue_url = config.get("queue_url")
        self.dlq_url = config.get("dlq_url")
        self.region_name = config.get("region_name", "us-east-1")
        self.aws_access_key_id = config.get("aws_access_key_id")
        self.aws_secret_access_key = config.get("aws_secret_access_key")
        self._session = None
        self._sqs_client = None
        self._message_map = {}

    async def initialize(self):
        """Initializes the SQS client."""
        if not self.queue_url:
            raise ValueError("SQS queue URL is not set.")
        self._session = aioboto3.Session(
            aws_access_key_id=self.aws_access_key_id,
            aws_secret_access_key=self.aws_secret_access_key,
            region_name=self.region_name
        )
        self._initialized = True
        logger.info("SQS client initialized.")

    async def close(self):
        """Closes the SQS client."""
        self._initialized = False
        logger.info("SQS client closed.")

    async def send_message(self, message: QueueMessage) -> bool:
        """
        Sends a message to the SQS queue.
        :param message:
        :return:
        """
        try:
            async with self._session.client('sqs') as sqs_client:
                response = await sqs_client.send_message(
                    QueueUrl=self.queue_url,
                    MessageBody=message.to_json_string(),
                    MessageAttributes={
                        'MessageType': {
                            'StringValue': message.type.value,
                            'DataType': 'String'
                        },
                        'CorrelationId': {
                            'StringValue': message.correlation_id or '',
                            'DataType': 'String'
                        }
                    }
                )
                logger.info(f"Message sent to SQS: {response.get('MessageId')}")
                return True
        except Exception as e:
            logger.error(f"Failed to send message to SQS: {e}")
            return False

    async def receive_messages(
        self,
        max_messages: int = 10,
        wait_time_seconds: int = 5,
        ) -> List[QueueMessage]:
        """
        :param max_messages:
        :param wait_time_seconds:
        :return:
        List[QueueMessage]: List of received messages.
        """
        try:
            async with self._session.client('sqs') as sqs_client:
                response = await sqs_client.receive_message(
                    QueueUrl=self.queue_url,
                    MaxNumberOfMessages=max_messages,
                    WaitTimeSeconds=wait_time_seconds,
                    MessageAttributeNames=['All']
                )
                messages = []
                for msg in response.get('Messages', []):
                    try:
                        queue_msg = QueueMessage.from_json_string(msg['Body'])
                        queue_msg.message_id = msg['MessageId']
                        self._message_map[queue_msg.message_id] = msg['ReceiptHandle']
                        messages.append(queue_msg)
                    except Exception as e:
                        logger.error(f"Failed to parse message from SQS: {e}")
                        # delete malformed message
                        await sqs_client.delete_message(
                            QueueUrl=self.queue_url,
                            ReceiptHandle=msg['ReceiptHandle']
                        )
                return messages
        except Exception as e:
            logger.error(f"Failed to receive messages from SQS: {e}")
            return []

    async def delete_message(self, message: QueueMessage) -> bool:
        """
        Deletes a message from the SQS queue.
        :param message:
        :return:
        Deletes a message from the SQS queue.
        """
        try:
            receipt_handle = self._message_map.get(message.message_id)
            if not receipt_handle:
                logger.error(f"No receipt handle found for message ID: {message.message_id}")
                return False
            async with self._session.client('sqs') as sqs_client:
                await sqs_client.delete_message(
                    QueueUrl=self.queue_url,
                    ReceiptHandle=receipt_handle
                )
                logger.info(f"Message deleted from SQS: {message.message_id}")
                return True
        except Exception as e:
            logger.error(f"Failed to delete message from SQS: {e}")
            return False

    async def return_message_to_queue(self, message: QueueMessage) -> bool:
        """
        Returns a message back to the SQS queue for reprocessing.
        :param message:
        :return:
        Returns a message back to the SQS queue for reprocessing.
        """
        try:
            reciept_handle = self._message_map.get(message.message_id)
            if not reciept_handle:
                logger.error(f"No receipt handle found for message ID: {message.message_id}")
                return False
            async with self._session.client('sqs') as sqs_client:
                await sqs_client.change_message_visibility(
                    QueueUrl=self.queue_url,
                    ReceiptHandle=reciept_handle,
                    VisibilityTimeout=0
                )
            del self._message_map[message.message_id]
            logger.info(f"Message returned to SQS queue for reprocessing: {message.message_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to return message to SQS queue: {e}")
            return False

    async def move_dead_letter_queue(self, message: QueueMessage, reason: str) -> bool:
        """
        Moves a message to the dead-letter queue.
        :param message:
        :param reason:
        :return:
        Moves a message to the dead-letter queue.
        """
        try:
            if not self.dlq_url:
                logger.error("DLQ URL is not set.")
                return await self.delete_message(message)

            receipt_handle = self._message_map.get(message.message_id)
            if not receipt_handle:
                logger.error(f"No receipt handle found for message ID: {message.message_id}")
                return False
            async with self._session.client('sqs') as sqs_client:
                # Send to DLQ
                await sqs_client.send_message(
                    QueueUrl=self.dlq_url,
                    MessageBody=message.to_json_string(),
                    MessageAttributes={
                        'Reason': {
                            'StringValue': reason,
                            'DataType': 'String'
                        },
                        'OriginalMessageId': {
                            'StringValue': message.message_id or '',
                            'DataType': 'String'
                        }
                    }
                )
                # Delete from main queue
                await sqs_client.delete_message(
                    QueueUrl=self.queue_url,
                    ReceiptHandle=receipt_handle
                )
                del self._message_map[message.message_id]
                logger.warning(f"Message moved to DLQ: {message.message_id}")
                return True
        except Exception as e:
            logger.error(f"Failed to move message to DLQ: {e}")
            return False

    async def get_queue_depth(self) -> int:
        """
        Gets the current depth of the SQS queue.
        :return:
        """
        try:
            async with self._session.client('sqs') as sqs_client:
                attributes = await sqs_client.get_queue_attributes(
                    QueueUrl=self.queue_url,
                    AttributeNames=['ApproximateNumberOfMessages']
                )
                depth = int(attributes['Attributes'].get('ApproximateNumberOfMessages', 0))
                logger.info(f"SQS queue depth: {depth}")
                return depth
        except Exception as e:
            logger.error(f"Failed to get SQS queue depth: {e}")
            return -1

    async def purge_queue(self) -> bool:
        """
        Purges all messages from the SQS queue.
        :return:
        """
        try:
            async with self._session.client('sqs') as sqs_client:
                await sqs_client.purge_queue(QueueUrl=self.queue_url)
                logger.info("SQS queue purged successfully.")
                return True
        except Exception as e:
            logger.error(f"Failed to purge SQS queue: {e}")
            return False