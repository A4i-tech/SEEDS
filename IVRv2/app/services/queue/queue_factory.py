from app.services.queue.base_queue_provider import BaseQueueProvider
from enum import Enum
import logging
import os

logger = logging.getLogger(__name__)

class QueueProviderType(str, Enum):
    """
    Enum for supported queue provider types.
    """
    AWS = "aws"
    AZURE = "azure"
    GOOGLE = "google"  # Placeholder for future Google Cloud Pub/Sub implementation
    MEMORY = "memory"  # Placeholder for future in-memory queue implementation

class QueueFactory:
    """
    Factory class to create queue provider instances based on configuration.
    Uses environment variables to determine which provider to use.
    """

    @staticmethod
    def create_queue_provider(provider_type: str = None) -> BaseQueueProvider:
        """
        Creates and returns an instance of the specified queue provider.
        Args:
            provider_type: str: The type of queue provider to create. If None, reads from environment variable.
        Returns:
            BaseQueueProvider: An instance of the specified queue provider.
        Raises:
            ValueError: If the specified provider type is not supported.
        """
        logger.info(f"Creating queue provider for type: {provider_type}")

        if provider_type == QueueProviderType.AZURE:
            return QueueFactory._create_azure_service_bus_provider()
        elif provider_type == QueueProviderType.AWS:
            return QueueFactory._create_aws_sqs_provider()
        elif provider_type == QueueProviderType.GOOGLE:
            return QueueFactory._create_google_provider()
        elif provider_type == QueueProviderType.MEMORY:
            return QueueFactory._create_memory_provider()
        else:
            raise ValueError(f"Unsupported queue provider type: {provider_type}")

    @staticmethod
    def _create_azure_service_bus_provider() -> BaseQueueProvider:
        """
        Creates an Azure Service Bus queue provider instance.
        :return:
        BaseQueueProvider: An instance of AzureServiceBusQueueProvider.
        """
        from app.services.queue.providers.azure_service_bus import AzureServiceBusQueueProvider

        config = {
            "connection_string": os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING"),
            "queue_name": os.getenv("AZURE_SERVICE_BUS_QUEUE_NAME", "ivr-call-queue"),
            "dlq_name": os.getenv("AZURE_SERVICE_BUS_DLQ_NAME"),
            "max_retries": int(os.getenv("AZURE_SERVICE_BUS_MAX_RETRIES", "3")),
        }

        if not config["connection_string"]:
            raise ValueError("Azure Service Bus connection string is not set in environment variables.")
        return AzureServiceBusQueueProvider(config)

    @staticmethod
    def _create_aws_sqs_provider() -> BaseQueueProvider:
        """
        Creates an AWS SQS queue provider instance.
        :return:
        BaseQueueProvider: An instance of AWSSQSQueueProvider.
        """
        try:
            from app.services.queue.providers.aws_sqs import AWSSQSQueueProvider
        except ImportError as e:
            raise RuntimeError(
                "AWS SQS provider requires aioboto3. Install it to use provider_type='aws'."
            ) from e

        config = {
            "queue_url": os.getenv("AWS_SQS_QUEUE_URL"),
            "dlq_url": os.getenv("AWS_SQS_DLQ_URL"),
            "region_name": os.getenv("AWS_REGION_NAME", "us-east-1"),
            "aws_access_key_id": os.getenv("AWS_ACCESS_KEY_ID"),
            "aws_secret_access_key": os.getenv("AWS_SECRET_ACCESS_KEY"),
            "max_retries": int(os.getenv("AWS_SQS_MAX_RETRIES", "3")),
        }

        if not config["queue_url"]:
            raise ValueError("AWS SQS queue URL is not set in environment variables.")
        return AWSSQSQueueProvider(config)

    @staticmethod
    def _create_google_provider() -> BaseQueueProvider:
        """
        Creates a GooglePubSub provider instance.
        :return:
        BaseQueueProvider: An instance of GooglePubSubQueueProvider.
        """
        from app.services.queue.providers.google_pubsub import GooglePubSubQueueProvider

        config = {
            "project_id": os.getenv("GOOGLE_CLOUD_PROJECT_ID"),
            "topic_name": os.getenv("GOOGLE_PUBSUB_TOPIC_NAME"),
            "subscription_name": os.getenv("GOOGLE_PUBSUB_SUBSCRIPTION_NAME"),
            "dlq_topic_name": os.getenv("GOOGLE_PUBSUB_DLQ_TOPIC_NAME"),
            "max_retries": int(os.getenv("GOOGLE_PUBSUB_MAX_RETRIES", "3")),
        }

        if not all([config["project_id"], config["topic_name"], config["subscription_name"]]):
            raise ValueError("Google Pub/Sub configuration is incomplete in environment variables.")
        return GooglePubSubQueueProvider(config)

    @staticmethod
    def _create_memory_provider() -> BaseQueueProvider:
        """
        Creates an In-Memory queue provider instance.
        :return:
        BaseQueueProvider: An instance of InMemoryQueueProvider.
        """
        from app.services.queue.providers.inmemory_queue import InMemoryQueueProvider

        config = {
            "queue_name": os.getenv("IN_MEMORY_QUEUE_NAME", "ivr-call-queue"),
            "max_size": int(os.getenv("IN_MEMORY_QUEUE_MAX_SIZE", "1000")),
            "max_retries": int(os.getenv("IN_MEMORY_QUEUE_MAX_RETRIES", "3")),
        }
        return InMemoryQueueProvider(config)

    @staticmethod
    def _create_rabbitmq_provider() -> BaseQueueProvider:
        """
        Creates a RabbitMQ queue provider instance.
        :return:
        BaseQueueProvider: An instance of RabbitMQProvider.
        """
        from app.services.queue.providers.rabbitmq import RabbitMQProvider

        config = {
            "host": os.getenv("RABBITMQ_HOST", "localhost"),
            "port": int(os.getenv("RABBITMQ_PORT", "5672")),
            "username": os.getenv("RABBITMQ_USERNAME", "guest"),
            "password": os.getenv("RABBITMQ_PASSWORD", "guest"),
            "queue_name": os.getenv("RABBITMQ_QUEUE_NAME", "ivr-call-queue"),
            "dlq_name": os.getenv("RABBITMQ_DLQ_NAME"),
            "max_retries": int(os.getenv("RABBITMQ_MAX_RETRIES", "3")),
        }

        return RabbitMQProvider(config)
