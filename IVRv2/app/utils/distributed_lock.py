"""
MongoDB-based distributed locking for concurrency control.
Uses MongoDB's atomic operations to implement advisory locks.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional, Any

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)


class DistributedLock:
    """
    Advisory lock using MongoDB for distributed systems.

    Uses a dedicated 'distributedLocks' collection with TTL index for automatic cleanup.
    The lock is acquired by inserting a document with the lock name as _id.
    """

    def __init__(self, collection: Any, lock_name: str, ttl_seconds: int = 30):
        """
        Initialize a distributed lock.

        Args:
            collection: PyMongo collection object
            lock_name: Unique identifier for the lock
            ttl_seconds: Time-to-live for the lock (auto-release)
        """
        self.collection = collection
        self.lock_name = lock_name
        self.ttl_seconds = ttl_seconds
        self._lock_id: Optional[str] = None

    async def acquire(self, timeout_seconds: float = 10.0) -> bool:
        """
        Attempt to acquire the lock.

        Args:
            timeout_seconds: Maximum time to wait for lock

        Returns:
            True if lock acquired, False otherwise
        """
        self._lock_id = str(uuid.uuid4())
        deadline = datetime.utcnow() + timedelta(seconds=timeout_seconds)

        while datetime.utcnow() < deadline:
            try:
                # Atomic insert - only succeeds if lock doesn't exist
                self.collection.insert_one({
                    "_id": self.lock_name,
                    "lock_id": self._lock_id,
                    "acquired_at": datetime.utcnow(),
                    "expires_at": datetime.utcnow() + timedelta(seconds=self.ttl_seconds)
                })
                logger.debug(f"Lock acquired: {self.lock_name}")
                return True
            except DuplicateKeyError:
                # Lock exists, check if expired
                existing = self.collection.find_one({"_id": self.lock_name})
                if existing and existing.get("expires_at", datetime.min) < datetime.utcnow():
                    # Expired lock, try to take over atomically
                    result = self.collection.find_one_and_update(
                        {
                            "_id": self.lock_name,
                            "expires_at": {"$lt": datetime.utcnow()}
                        },
                        {
                            "$set": {
                                "lock_id": self._lock_id,
                                "acquired_at": datetime.utcnow(),
                                "expires_at": datetime.utcnow() + timedelta(seconds=self.ttl_seconds)
                            }
                        },
                        return_document=ReturnDocument.AFTER
                    )
                    if result and result.get("lock_id") == self._lock_id:
                        logger.debug(f"Expired lock taken over: {self.lock_name}")
                        return True

            await asyncio.sleep(0.1)  # Small delay before retry

        logger.warning(f"Failed to acquire lock: {self.lock_name} (timeout after {timeout_seconds}s)")
        return False

    async def release(self) -> bool:
        """
        Release the lock.

        Returns:
            True if lock was released, False if lock was not held
        """
        if not self._lock_id:
            return False

        result = self.collection.delete_one({
            "_id": self.lock_name,
            "lock_id": self._lock_id  # Only delete if we own it
        })

        released = result.deleted_count > 0
        if released:
            logger.debug(f"Lock released: {self.lock_name}")
        else:
            logger.warning(f"Lock release failed (not owner or expired): {self.lock_name}")

        self._lock_id = None
        return released

    async def extend(self, additional_seconds: int = 30) -> bool:
        """
        Extend the lock TTL.

        Args:
            additional_seconds: Additional time to add

        Returns:
            True if extended, False if lock not held
        """
        if not self._lock_id:
            return False

        result = self.collection.find_one_and_update(
            {
                "_id": self.lock_name,
                "lock_id": self._lock_id
            },
            {
                "$set": {
                    "expires_at": datetime.utcnow() + timedelta(seconds=additional_seconds)
                }
            },
            return_document=ReturnDocument.AFTER
        )

        extended = result is not None
        if extended:
            logger.debug(f"Lock extended: {self.lock_name} by {additional_seconds}s")
        return extended


class DistributedLockContext:
    """
    Async context manager for distributed locks.

    Usage:
        async with DistributedLockContext(collection, "phone:+1234567890") as acquired:
            if acquired:
                # Do protected work
            else:
                # Handle lock acquisition failure
    """

    def __init__(
        self,
        collection: Any,
        lock_name: str,
        ttl_seconds: int = 30,
        timeout_seconds: float = 10.0
    ):
        """
        Initialize lock context manager.

        Args:
            collection: PyMongo collection object
            lock_name: Unique identifier for the lock
            ttl_seconds: Time-to-live for the lock
            timeout_seconds: Maximum time to wait for lock acquisition
        """
        self.lock = DistributedLock(collection, lock_name, ttl_seconds)
        self.timeout_seconds = timeout_seconds
        self._acquired = False

    async def __aenter__(self) -> bool:
        """Acquire lock on context entry."""
        self._acquired = await self.lock.acquire(self.timeout_seconds)
        return self._acquired

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Release lock on context exit."""
        if self._acquired:
            await self.lock.release()
        return False  # Don't suppress exceptions
