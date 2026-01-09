"""
MongoDB database management using FastAPI lifespan and dependency injection.

This module provides a clean, testable approach to MongoDB connection management
without relying on global state or module-level side effects.
"""

import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from pymongo import MongoClient
from pymongo.database import Database

from app.interfaces.database import IDatabase
from app.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class MongoDBManager:
    """Manages MongoDB client lifecycle and provides collection access.

    This class encapsulates MongoDB connection management, ensuring proper
    initialization and cleanup without relying on global state.
    """

    _client: Optional[MongoClient] = field(default=None, repr=False)
    _database_name: Optional[str] = field(default=None)
    _database: Optional[Database] = field(default=None, repr=False)

    def initialize(self) -> None:
        """Initialize the MongoDB client and database connection.

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
            raise ValueError("MONGO_DB_CONNECTION_STRING environment variable not set")

        # Parse database name BEFORE creating client to ensure atomicity
        try:
            parsed_url = urlparse(connection_string)
            path = parsed_url.path.lstrip("/").split("?")[0]
            if not path:
                raise ValueError("Database name not found in connection string")
            self._database_name = path
        except Exception as e:
            raise ValueError(f"Error parsing database name from connection string: {e}")

        # Only create client after successful URL parsing
        self._client = MongoClient(
            connection_string,
            maxPoolSize=settings.mongo_max_pool_size,
            serverSelectionTimeoutMS=5000,
        )
        self._database = self._client[self._database_name]
        logger.info(
            f"MongoDB client initialized successfully, database: {self._database_name}"
        )

    def close(self) -> None:
        """Close the MongoDB client connection gracefully.

        Safe to call multiple times (idempotent).
        """
        if self._client is not None:
            try:
                self._client.close()
                logger.info("MongoDB client connection closed successfully")
            except Exception as e:
                logger.warning(f"Error closing MongoDB client: {e}")
            finally:
                self._client = None
                self._database = None
                self._database_name = None
        else:
            logger.debug("MongoDB client already closed or never initialized")

    @property
    def client(self) -> MongoClient:
        """Get the MongoDB client instance.

        Raises:
            RuntimeError: If the manager has not been initialized.
        """
        if self._client is None:
            raise RuntimeError(
                "MongoDB manager not initialized. Call initialize() first."
            )
        return self._client

    @property
    def database(self) -> Database:
        """Get the database instance.

        Raises:
            RuntimeError: If the manager has not been initialized.
        """
        if self._database is None:
            raise RuntimeError(
                "MongoDB manager not initialized. Call initialize() first."
            )
        return self._database

    @property
    def database_name(self) -> str:
        """Get the database name.

        Raises:
            RuntimeError: If the manager has not been initialized.
        """
        if self._database_name is None:
            raise RuntimeError(
                "MongoDB manager not initialized. Call initialize() first."
            )
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

    Provides async methods for common database operations using asyncio.to_thread
    to avoid blocking the event loop.
    """

    def __init__(self, collection):
        """Initialize with a PyMongo collection instance."""
        self.collection = collection

    async def find_by_id(self, id_string: str) -> Optional[Dict[str, Any]]:
        """Find a document by its _id field."""
        import asyncio

        return await asyncio.to_thread(self.collection.find_one, {"_id": id_string})

    async def find_one_by_query(self, query: dict) -> Optional[Dict[str, Any]]:
        """Find a single document matching the query."""
        import asyncio

        return await asyncio.to_thread(self.collection.find_one, query)

    async def find_all(self) -> List[Dict[str, Any]]:
        """Find all documents in the collection."""
        import asyncio

        return await asyncio.to_thread(lambda: list(self.collection.find()))

    async def query_items(self, query: dict) -> List[Dict[str, Any]]:
        """Find all documents matching the query."""
        import asyncio

        return await asyncio.to_thread(lambda: list(self.collection.find(query)))

    async def insert(self, doc: dict) -> Any:
        """Insert a document into the collection."""
        import asyncio

        result = await asyncio.to_thread(self.collection.insert_one, doc)
        if not result.acknowledged:
            raise RuntimeError(
                f"MongoDB insert not acknowledged for doc: {doc.get('_id')}"
            )
        return result.inserted_id

    async def update_document(self, id: str, new_doc: dict) -> Any:
        """Replace a document by its _id field."""
        import asyncio

        result = await asyncio.to_thread(
            self.collection.replace_one, {"_id": id}, new_doc, True
        )
        if not result.acknowledged:
            raise RuntimeError(f"MongoDB update not acknowledged for id: {id}")
        return result

    async def delete(self, id: str) -> Any:
        """Delete a document by its _id field."""
        import asyncio

        result = await asyncio.to_thread(self.collection.delete_one, {"_id": id})
        if not result.acknowledged:
            raise RuntimeError(f"MongoDB delete not acknowledged for id: {id}")
        return result

    async def find_top_one(self, attr: str) -> Optional[Dict[str, Any]]:
        """Find the document with the highest value for the specified attribute."""
        import asyncio

        return await asyncio.to_thread(
            lambda: self.collection.find_one(sort=[(attr, -1)])
        )

    def get_collection(self):
        """Get the underlying PyMongo collection."""
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


def close_mongodb_manager() -> None:
    """Close the global MongoDB manager.

    Called during application lifespan shutdown.
    """
    global mongodb_manager
    if mongodb_manager is not None:
        mongodb_manager.close()
        mongodb_manager = None
