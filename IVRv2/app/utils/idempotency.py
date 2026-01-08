"""
Idempotency key management for preventing duplicate processing.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)


class IdempotencyStore:
    """
    Stores idempotency keys to prevent duplicate processing.
    Uses MongoDB with TTL index for automatic cleanup.

    The collection should have a TTL index on 'expires_at' field:
        db.idempotencyKeys.createIndex({ "expires_at": 1 }, { expireAfterSeconds: 0 })
    """

    def __init__(self, collection: Any, ttl_hours: int = 24):
        """
        Initialize idempotency store.

        Args:
            collection: PyMongo collection object
            ttl_hours: How long to remember processed keys
        """
        self.collection = collection
        self.ttl_hours = ttl_hours

    async def check_and_set(
        self,
        idempotency_key: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Check if key exists, if not set it atomically.

        Args:
            idempotency_key: Unique key to check
            metadata: Optional metadata to store

        Returns:
            True if this is a NEW key (should process)
            False if key already exists (duplicate, skip)
        """
        try:
            doc = {
                "_id": idempotency_key,
                "processed_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(hours=self.ttl_hours)
            }
            if metadata:
                doc["metadata"] = metadata

            self.collection.insert_one(doc)
            logger.debug(f"Idempotency key set: {idempotency_key}")
            return True

        except DuplicateKeyError:
            logger.info(f"Duplicate idempotency key rejected: {idempotency_key}")
            return False

    async def get(self, idempotency_key: str) -> Optional[Dict[str, Any]]:
        """
        Get stored data for an idempotency key.

        Args:
            idempotency_key: Key to look up

        Returns:
            Stored document or None
        """
        return self.collection.find_one({"_id": idempotency_key})

    async def delete(self, idempotency_key: str) -> bool:
        """
        Delete an idempotency key (for cleanup or retry).

        Args:
            idempotency_key: Key to delete

        Returns:
            True if deleted, False if not found
        """
        result = self.collection.delete_one({"_id": idempotency_key})
        deleted = result.deleted_count > 0
        if deleted:
            logger.debug(f"Idempotency key deleted: {idempotency_key}")
        return deleted

    async def exists(self, idempotency_key: str) -> bool:
        """
        Check if an idempotency key exists.

        Args:
            idempotency_key: Key to check

        Returns:
            True if exists, False otherwise
        """
        return self.collection.find_one({"_id": idempotency_key}) is not None
