"""
Storage backend factory. Returns the configured StorageManager implementation.
"""

import os

from app.services.storage_manager.base_storage_manager import StorageManager
from app.services.storage_manager.cosmosdb_storage import CosmosDBStorage
from app.services.storage_manager.mongodb_storage import MongoDBStorage


def create_storage_manager() -> StorageManager:
    """
    Return the StorageManager for the configured backend.

    Uses STORAGE_BACKEND env: "cosmos" | "mongodb". Default "mongodb".
    """
    from config import get_settings

    backend = (os.environ.get("STORAGE_BACKEND") or "mongodb").strip().lower()
    s = get_settings()

    if backend == "cosmos":
        return CosmosDBStorage(
            endpoint=s.COSMOS_ENDPOINT,
            key=s.COSMOS_KEY,
            database_name=s.COSMOS_DATABASE,
            container_name=s.COSMOS_CONTAINER,
        )
    if backend == "mongodb":
        conn = (s.MONGO_DB_CONNECTION_STRING or "").strip()
        if not conn or conn.upper() == "NONE":
            raise ValueError(
                "MONGO_DB_CONNECTION_STRING must be set when STORAGE_BACKEND=mongodb"
            )
        return MongoDBStorage()

    raise ValueError(
        f"Unknown STORAGE_BACKEND={backend!r}. Use cosmos or mongodb."
    )
