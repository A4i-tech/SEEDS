from app.services.queue.base_queue_provider import BaseQueueProvider
from enum import Enum
import logging
import os
from app.settings import settings

logger = logging.getLogger(__name__)


class QueueProviderType(str, Enum):
    """
    Enum for supported queue provider types.
    """

    AWS = "aws"  # Placeholder for future AWS SQS implementation
    AZURE = "azure"
    GOOGLE = "google"  # Placeholder for future Google Cloud Pub/Sub implementation
    MEMORY = "memory"  # Placeholder for future in-memory queue implementation


class QueueFactory:
    """
    Factory class to create queue provider instances based on configuration.
    Uses environment variables to determine which provider to use.
    """

    @staticmethod
    def create_queue_provider(
        queue_name: str, provider_type: str = None
    ) -> BaseQueueProvider:
        """
        Creates and returns an instance of the specified queue provider.
        Args:
            queue_name: str: The name of the queue to use.
            provider_type: str: The type of queue provider to create (mandatory).
        Returns:
            BaseQueueProvider: An instance of the specified queue provider.
        Raises:
            ValueError: If the specified provider type is not supported or missing.
        """
        if not provider_type:
            raise ValueError("provider_type is required and cannot be None")
        logger.info(f"Creating queue provider for type: {provider_type}")

        if provider_type == QueueProviderType.AZURE:
            return QueueFactory._create_azure_service_bus_provider(queue_name)
        else:
            raise ValueError(f"Unsupported queue provider type: {provider_type}")

    @staticmethod
    def _create_azure_service_bus_provider(queue_name) -> BaseQueueProvider:
        """
        Creates an Azure Service Bus queue provider instance.
        :return:
        BaseQueueProvider: An instance of AzureServiceBusQueueProvider.
        """
        from app.services.queue.providers.azure_service_bus import (
            AzureServiceBusQueueProvider,
        )

        config = {
            "connection_string": settings.azure_service_bus_connection_string,
            "queue_name": queue_name,
            "dlq_name": f"{queue_name}-dlq",
            "max_retries": settings.azure_service_bus_max_retries,
        }

        if not config["connection_string"]:
            raise ValueError(
                "Azure Service Bus connection string is not set in environment variables."
            )
        return AzureServiceBusQueueProvider(config)

    @staticmethod
    def _create_aws_sqs_provider() -> BaseQueueProvider:
        """
        TODO:
        Creates an AWS SQS queue provider instance.
        """
        raise NotImplementedError("AWS SQS provider is not yet implemented")

    @staticmethod
    def _create_google_provider() -> BaseQueueProvider:
        """
        TODO:
        Creates a Google Cloud Pub/Sub queue provider instance.
        """
        raise NotImplementedError(
            "Google Cloud Pub/Sub provider is not yet implemented"
        )

    @staticmethod
    def _create_memory_provider() -> BaseQueueProvider:
        """
        TODO:
        Creates an in-memory queue provider instance.
        """
        raise NotImplementedError("In-memory provider is not yet implemented")

    @staticmethod
    def _create_rabbitmq_provider() -> BaseQueueProvider:
        """
        TODO:
        Creates a RabbitMQ queue provider instance.
        """
        raise NotImplementedError("RabbitMQ provider is not yet implemented")
