"""
MongoDB client singleton for ConferenceV2 storage.

Provides a single AsyncIOMotorClient instance per process. All MongoDB storage
access goes through get_mongodb_manager(). Use init_mongodb_manager() for
explicit init, and close_mongodb_manager() in lifespan shutdown.
"""

from typing import Optional
from urllib.parse import urlparse

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection

from app.conf_logger import logger_instance


class MongoDBClientManager:
    """Singleton manager for async MongoDB client and collection access."""

    def __init__(self) -> None:
        self._client: Optional[AsyncIOMotorClient] = None
        self._database: Optional[AsyncIOMotorDatabase] = None
        self._collection: Optional[AsyncIOMotorCollection] = None
        self._database_name: Optional[str] = None
        self._collection_name: Optional[str] = None

    def initialize(
        self,
        connection_string: str,
        collection_name: str,
        max_pool_size: int = 50,
        server_selection_timeout_ms: int = 5000,
    ) -> None:
        """Create and store the async MongoDB client, database, and collection.

        Database name is parsed from the connection string path, e.g.:
        - mongodb://localhost:27017/SEEDS-Teacher-Backend -> SEEDS-Teacher-Backend
        - mongodb+srv://.../SEEDS-Teacher-Backend?retryWrites=... -> SEEDS-Teacher-Backend
        """
        if self._client is not None:
            logger_instance.warning("MongoDB client already initialized")
            return

        if not connection_string or connection_string.strip().upper() == "NONE":
            raise ValueError(
                "MONGO_DB_CONNECTION_STRING must be set when using MongoDB storage"
            )

        parsed = urlparse(connection_string)
        path = parsed.path.lstrip("/").split("?")[0]
        if not path:
            raise ValueError(
                "Database name not found in MONGO_DB_CONNECTION_STRING. "
                "Use format: mongodb://host:port/database_name or "
                "mongodb+srv://.../database_name?..."
            )

        self._database_name = path
        self._collection_name = collection_name or "conference_state"

        self._client = AsyncIOMotorClient(
            connection_string,
            maxPoolSize=max_pool_size,
            serverSelectionTimeoutMS=server_selection_timeout_ms,
        )
        self._database = self._client[self._database_name]
        self._collection = self._database[self._collection_name]

        logger_instance.info(
            f"MongoDB client initialized: db={self._database_name}, collection={self._collection_name}"
        )

    async def close(self) -> None:
        """Close the MongoDB client. Idempotent."""
        if self._client is None:
            return
        try:
            await self._client.close()
            logger_instance.info("MongoDB client closed")
        except Exception as e:
            logger_instance.warning("Error closing MongoDB client:", str(e))
        finally:
            self._client = None
            self._database = None
            self._collection = None
            self._database_name = None
            self._collection_name = None

    def get_collection(self) -> AsyncIOMotorCollection:
        """Return the Motor collection for conference state."""
        if self._collection is None:
            raise RuntimeError(
                "MongoDB client not initialized. Ensure get_mongodb_manager() has been called "
                "and MongoDB storage is configured."
            )
        return self._collection


_mongo_manager: Optional[MongoDBClientManager] = None


def get_mongodb_manager() -> MongoDBClientManager:
    """Return the singleton MongoDB manager. Lazy-initializes on first use."""
    global _mongo_manager
    if _mongo_manager is None:
        from config import get_settings

        s = get_settings()
        _mongo_manager = MongoDBClientManager()
        _mongo_manager.initialize(
            connection_string=s.MONGO_DB_CONNECTION_STRING,
            collection_name=s.MONGO_COLLECTION_NAME,
            max_pool_size=s.MONGO_MAX_POOL_SIZE,
        )
    return _mongo_manager


def init_mongodb_manager(
    connection_string: str,
    collection_name: str,
    max_pool_size: int = 50,
    server_selection_timeout_ms: int = 5000,
) -> MongoDBClientManager:
    """Explicitly initialize the global MongoDB manager. Used from lifespan if desired.
    Database name is parsed from connection_string path."""
    global _mongo_manager
    _mongo_manager = MongoDBClientManager()
    _mongo_manager.initialize(
        connection_string=connection_string,
        collection_name=collection_name,
        max_pool_size=max_pool_size,
        server_selection_timeout_ms=server_selection_timeout_ms,
    )
    return _mongo_manager


async def close_mongodb_manager() -> None:
    """Close the global MongoDB manager. No-op if never initialized. Call from lifespan shutdown."""
    global _mongo_manager
    if _mongo_manager is not None:
        await _mongo_manager.close()
        _mongo_manager = None
