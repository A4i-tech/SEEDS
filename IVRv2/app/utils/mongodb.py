"""
MongoDB database access module.

This module provides backward-compatible access to MongoDB collections.
New code should prefer using app.core.database and dependency injection.

DEPRECATED: Direct use of get_mongo_client() and MongoDB class at module level.
Prefer using the lifespan-managed MongoDBManager and dependency injection instead.
"""

import asyncio
import logging
import warnings
from typing import Any, Dict, List, Optional

from app.interfaces.database import IDatabase
from app.core.database import (
    MongoDBManager,
    MongoDBCollection,
    mongodb_manager,
    get_mongodb_manager,
    init_mongodb_manager,
    close_mongodb_manager,
)

logger = logging.getLogger(__name__)


def get_mongo_client():
    """Get the MongoDB client from the global manager.

    DEPRECATED: Use dependency injection with get_mongodb_manager() instead.

    Returns:
        MongoClient instance.

    Raises:
        RuntimeError: If the manager has not been initialized via lifespan.
    """
    warnings.warn(
        "get_mongo_client() is deprecated. Use dependency injection instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    return get_mongodb_manager().client


def get_database_name() -> str:
    """Get the database name from the global manager.

    DEPRECATED: Use dependency injection with get_mongodb_manager() instead.

    Returns:
        Database name string.

    Raises:
        RuntimeError: If the manager has not been initialized via lifespan.
    """
    warnings.warn(
        "get_database_name() is deprecated. Use dependency injection instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    return get_mongodb_manager().database_name


def close_mongo_client() -> None:
    """Close the MongoDB client connection pool gracefully.

    DEPRECATED: Cleanup is handled automatically by the lifespan manager.
    """
    warnings.warn(
        "close_mongo_client() is deprecated. Lifespan handles cleanup automatically.",
        DeprecationWarning,
        stacklevel=2,
    )
    close_mongodb_manager()


class MongoDB(IDatabase):
    """MongoDB collection wrapper implementing the IDatabase interface.

    This class provides backward compatibility for existing code.
    New code should use MongoDBCollection from app.core.database with
    dependency injection.
    """

    def __init__(self, collection_name: str):
        """Initialize with a collection name.

        Note: This requires the MongoDBManager to be initialized via lifespan.
        For module-level instantiation during import, this will fail until
        the application starts. Consider using dependency injection instead.
        """
        try:
            manager = get_mongodb_manager()
            self.db = manager.database
            self.collection = self.db[collection_name]
        except RuntimeError:
            # During import time, manager may not be initialized yet
            # Store collection name and initialize lazily
            self._collection_name = collection_name
            self._lazy_initialized = False
            self.db = None
            self.collection = None

    def _ensure_initialized(self) -> None:
        """Ensure the collection is initialized (lazy initialization)."""
        if self.collection is None:
            manager = get_mongodb_manager()
            self.db = manager.database
            self.collection = self.db[self._collection_name]
            self._lazy_initialized = True

    async def find_by_id(self, id_string: str) -> Optional[Dict[str, Any]]:
        self._ensure_initialized()
        return await asyncio.to_thread(self.collection.find_one, {"_id": id_string})

    async def find_one_by_query(self, query: dict) -> Optional[Dict[str, Any]]:
        self._ensure_initialized()
        return await asyncio.to_thread(self.collection.find_one, query)

    async def find_all(self) -> List[Dict[str, Any]]:
        self._ensure_initialized()
        return await asyncio.to_thread(lambda: list(self.collection.find()))

    async def query_items(self, query: dict) -> List[Dict[str, Any]]:
        self._ensure_initialized()
        return await asyncio.to_thread(lambda: list(self.collection.find(query)))

    async def insert(self, doc: dict) -> Any:
        self._ensure_initialized()
        result = await asyncio.to_thread(self.collection.insert_one, doc)
        if not result.acknowledged:
            raise RuntimeError(
                f"MongoDB insert not acknowledged for doc: {doc.get('_id')}"
            )
        return result.inserted_id

    async def update_document(self, id: str, new_doc: dict) -> Any:
        self._ensure_initialized()
        result = await asyncio.to_thread(
            self.collection.replace_one, {"_id": id}, new_doc, True
        )
        if not result.acknowledged:
            raise RuntimeError(f"MongoDB update not acknowledged for id: {id}")
        return result

    async def delete(self, id: str) -> Any:
        self._ensure_initialized()
        result = await asyncio.to_thread(self.collection.delete_one, {"_id": id})
        if not result.acknowledged:
            raise RuntimeError(f"MongoDB delete not acknowledged for id: {id}")
        return result

    async def find_top_one(self, attr: str) -> Optional[Dict[str, Any]]:
        self._ensure_initialized()
        return await asyncio.to_thread(
            lambda: self.collection.find_one(sort=[(attr, -1)])
        )

    def get_collection(self):
        self._ensure_initialized()
        return self.collection
