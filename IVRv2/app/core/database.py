"""
MongoDB database management using FastAPI lifespan and dependency injection.

This module provides a clean, testable approach to MongoDB connection management
without relying on global state or module-level side effects.

Uses Motor for async MongoDB operations.
"""

import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.interfaces.database import IDatabase
from app.settings import settings
from app.core.telemetry import get_tracer
from app.application_logger.azure_app_insights import AppInsightsLogHandler

tracer = get_tracer(__name__)
logger = AppInsightsLogHandler.getLogger(__name__)


@dataclass
class MongoDBManager:
    """Manages async MongoDB client lifecycle using Motor and provides collection access.

    This class encapsulates MongoDB connection management, ensuring proper
    initialization and cleanup without relying on global state.
    """

    _client: Optional[AsyncIOMotorClient] = field(default=None, repr=False)
    _database_name: Optional[str] = field(default=None)
    _database: Optional[AsyncIOMotorDatabase] = field(default=None, repr=False)

    def initialize(self) -> None:
        """Initialize the async MongoDB client and database connection.

        Parses the connection string first to ensure atomicity - if parsing fails,
        no client is created, preventing inconsistent state.

        Raises:
            ValueError: If connection string is not set or database name cannot be parsed.
        """
        if self._client is not None:
            logger.warning("MongoDB manager already initialized")
            return

        connection_string = settings.mongo_db_connection_string
        if not connection_string or connection_string == "NONE":
            error_msg = "MONGO_DB_CONNECTION_STRING environment variable not set"
            logger.error(f"[MongoDB Init] {error_msg}")
            raise ValueError(error_msg)

        # Parse database name BEFORE creating client to ensure atomicity
        try:
            parsed_url = urlparse(connection_string)
            path = parsed_url.path.lstrip("/").split("?")[0]
            if not path:
                error_msg = "Database name not found in connection string path"
                logger.error(
                    f"[MongoDB Init] {error_msg}. Connection string pattern: mongodb://host:port/database_name"
                )
                raise ValueError(error_msg)
            self._database_name = path
        except Exception as e:
            error_msg = f"Error parsing database name from connection string: {e}"
            logger.error(f"[MongoDB Init] {error_msg}")
            raise ValueError(error_msg) from e

        # Only create client after successful URL parsing
        self._client = AsyncIOMotorClient(
            connection_string,
            maxPoolSize=settings.mongo_max_pool_size,
            serverSelectionTimeoutMS=5000,
        )
        self._database = self._client[self._database_name]
        logger.info(
            f"MongoDB async client initialized successfully, database: {self._database_name}"
        )

    async def close(self) -> None:
        """Close the MongoDB client connection gracefully.

        Safe to call multiple times (idempotent).
        """
        if self._client is not None:
            try:
                await self._client.close()
                logger.info(
                    "[MongoDB Shutdown] MongoDB async client connection closed successfully"
                )
            except Exception as e:
                logger.warning(
                    f"[MongoDB Shutdown] Error closing MongoDB async client: {e}"
                )
            finally:
                self._client = None
                self._database = None
                self._database_name = None
        else:
            logger.debug(
                "[MongoDB Shutdown] MongoDB client already closed or never initialized"
            )

    @property
    def client(self) -> AsyncIOMotorClient:
        """Get the async MongoDB client instance.

        Raises:
            RuntimeError: If the manager has not been initialized.
        """
        if self._client is None:
            error_msg = (
                "MongoDB manager not initialized. Call initialize() first. "
                "Ensure the application lifespan startup completed successfully."
            )
            logger.error(f"[MongoDB Access] {error_msg}")
            raise RuntimeError(error_msg)
        return self._client

    @property
    def database(self) -> AsyncIOMotorDatabase:
        """Get the database instance.

        Raises:
            RuntimeError: If the manager has not been initialized.
        """
        if self._database is None:
            error_msg = (
                "MongoDB manager not initialized. Call initialize() first. "
                "Ensure the application lifespan startup completed successfully."
            )
            logger.error(f"[MongoDB Access] {error_msg}")
            raise RuntimeError(error_msg)
        return self._database

    @property
    def database_name(self) -> str:
        """Get the database name.

        Raises:
            RuntimeError: If the manager has not been initialized.
        """
        if self._database_name is None:
            error_msg = (
                "MongoDB manager not initialized. Call initialize() first. "
                "Ensure the application lifespan startup completed successfully."
            )
            logger.error(f"[MongoDB Access] {error_msg}")
            raise RuntimeError(error_msg)
        return self._database_name

    def get_collection(self, collection_name: str) -> "MongoDBCollection":
        """Get a collection wrapper for the specified collection name.

        Args:
            collection_name: Name of the MongoDB collection.

        Returns:
            MongoDBCollection instance wrapping the specified collection.
        """
        return MongoDBCollection(self.database[collection_name])


class MongoDBCollection(IDatabase):
    """MongoDB collection wrapper implementing the IDatabase interface.

    Provides async methods for common database operations using Motor.
    """

    def __init__(self, collection):
        """Initialize with a Motor AsyncIOMotorCollection instance."""
        self.collection = collection

    async def find_by_id(self, id_string: str) -> Optional[Dict[str, Any]]:
        """Find a document by its _id field."""
        return await self.collection.find_one({"_id": id_string})

    async def find_one_by_query(self, query: dict) -> Optional[Dict[str, Any]]:
        """Find a single document matching the query."""
        return await self.collection.find_one(query)

    async def find_all(self) -> List[Dict[str, Any]]:
        """Find all documents in the collection."""
        cursor = self.collection.find({})
        return await cursor.to_list(length=None)

    async def query_items(self, query: dict) -> List[Dict[str, Any]]:
        """Find all documents matching the query."""
        cursor = self.collection.find(query)
        return await cursor.to_list(length=None)

    async def insert(self, doc: dict) -> Any:
        """Insert a document into the collection."""
        result = await self.collection.insert_one(doc)
        if not result.inserted_id:
            raise RuntimeError(f"MongoDB insert failed for doc: {doc.get('_id')}")
        return result.inserted_id

    async def update_document(self, id: str, new_doc: dict) -> Any:
        """Replace a document by its _id field."""
        result = await self.collection.replace_one({"_id": id}, new_doc, upsert=True)
        if not result.acknowledged:
            raise RuntimeError(f"MongoDB update not acknowledged for id: {id}")
        return result

    async def update_one(self, filter_query: dict, update_query: dict) -> Any:
        """Update a single document with atomic operators (e.g., $set).

        This method is ideal for atomic updates using MongoDB operators like $set,
        $inc, $push, etc. to avoid lost updates in concurrent scenarios.

        Args:
            filter_query: The filter to match documents (e.g., {"_id": "value"})
            update_query: The update operations (e.g., {"$set": {"field": "value"}})

        Returns:
            The update result object with modified_count, matched_count, etc.

        Raises:
            RuntimeError: If the update is not acknowledged by the server
        """
        result = await self.collection.update_one(filter_query, update_query)
        if not result.acknowledged:
            raise RuntimeError(
                f"MongoDB atomic update not acknowledged for filter: {filter_query}"
            )
        return result

    async def delete(self, id: str) -> Any:
        """Delete a document by its _id field."""
        result = await self.collection.delete_one({"_id": id})
        if not result.acknowledged:
            raise RuntimeError(f"MongoDB delete not acknowledged for id: {id}")
        return result

    async def find_top_one(self, attr: str) -> Optional[Dict[str, Any]]:
        """Find the document with the highest value for the specified attribute."""
        return await self.collection.find_one(sort=[(attr, -1)])

    def get_collection(self):
        """Get the underlying Motor collection."""
        return self.collection


# Global manager instance - initialized via lifespan, not at import time
mongodb_manager: Optional[MongoDBManager] = None


def get_mongodb_manager() -> MongoDBManager:
    """Dependency injection function to get the MongoDB manager.

    Returns:
        The initialized MongoDBManager instance.

    Raises:
        RuntimeError: If the manager has not been initialized.
    """
    if mongodb_manager is None:
        raise RuntimeError(
            "MongoDB manager not initialized. Ensure app lifespan has started."
        )
    return mongodb_manager


def init_mongodb_manager() -> MongoDBManager:
    """Initialize the global MongoDB manager.

    Called during application lifespan startup.

    Returns:
        The initialized MongoDBManager instance.
    """
    global mongodb_manager
    mongodb_manager = MongoDBManager()
    mongodb_manager.initialize()
    return mongodb_manager


async def close_mongodb_manager() -> None:
    """Close the global MongoDB manager.

    Called during application lifespan shutdown.
    """
    global mongodb_manager
    if mongodb_manager is not None:
        await mongodb_manager.close()
        mongodb_manager = None
