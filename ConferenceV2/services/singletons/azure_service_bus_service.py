import json
import asyncio
import traceback
from azure.servicebus.aio import ServiceBusClient
from azure.servicebus import ServiceBusMessage
from azure.identity.aio import DefaultAzureCredential
from dotenv import load_dotenv
import os
from conf_logger import logger_instance

from models.ws_service_message import WebsocketServiceMessage

load_dotenv()

class AzureServiceBusService:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(AzureServiceBusService, cls).__new__(cls, *args, **kwargs)
            cls._instance.initialize()  # Call initialize only once when the instance is created
        return cls._instance

    def initialize(self):
        """Initialize the Azure Service Bus client."""
        self.queue_to_wsservice = "queue-to-wsservice"
        self.queue_from_wsservice = "queue-to-confserver"
        self.credential = DefaultAzureCredential()  # Store credential for reuse
        servicebus_namespace = os.environ.get('SERVICE_BUS_NS_NAME', '')
        self.servicebus_client = ServiceBusClient(fully_qualified_namespace=servicebus_namespace, credential=self.credential, logging_enable=True)

    async def send_message(self, message: WebsocketServiceMessage):
        try:
            async with self.servicebus_client:
                sender = self.servicebus_client.get_queue_sender(self.queue_to_wsservice)
                async with sender:
                    logger_instance.info("SENDING MESSAGE TO WS SERVICE:", message)
                    await sender.send_messages(ServiceBusMessage(json.dumps(message.model_dump())))
                    await sender.close()
        except Exception as e:
            logger_instance.error("Error sending message:", e)
            traceback_str = ''.join(traceback.format_tb(e.__traceback__))
            logger_instance.error("Traceback:\n%s", traceback_str)

    async def receive_messages(self):
        logger_instance.info("STARTING LISTENING FOR MESSAGES IN THE QUEUE", self.queue_from_wsservice)
        async with self.servicebus_client:
            receiver = self.servicebus_client.get_queue_receiver(self.queue_from_wsservice)
            async with receiver:
                async for message in receiver:
                    decoded_message = message.body.decode("utf-8")
                    logger_instance.info("Received:", decoded_message)
                    await receiver.complete_message(message)
