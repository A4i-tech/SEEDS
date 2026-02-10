"""
MongoDB StorageManager implementation for ConferenceV2.

Uses the singleton MongoDB client only. Never creates its own client.
"""

import copy

from pymongo.errors import ServerSelectionTimeoutError

from app.services.storage_manager.base_storage_manager import StorageManager
from app.services.storage_manager.mongodb_client import get_mongodb_manager
from app.conf_logger import logger_instance


class MongoDBStorage(StorageManager):
    """StorageManager backed by MongoDB. Uses singleton client via get_mongodb_manager()."""

    async def save_state(self, conference_id: str, state: dict) -> None:
        """Upsert conference state into MongoDB. Uses a copy of state; sets _id."""
        coll = get_mongodb_manager().get_collection()
        state_copy = copy.deepcopy(state)
        state_copy["_id"] = conference_id
        state_copy["id"] = conference_id  # Cosmos-style compatibility
        try:
            await coll.replace_one(
                {"_id": conference_id},
                state_copy,
                upsert=True,
            )
        except ServerSelectionTimeoutError as e:
            logger_instance.error("MongoDB save_state failed (timeout):", str(e))
            raise
        except Exception as e:
            logger_instance.error("MongoDB save_state failed:", str(e))
            raise

    async def load_state(self, conference_id: str) -> dict | None:
        """Load conference state by id. Returns None if not found or on error."""
        coll = get_mongodb_manager().get_collection()
        try:
            doc = await coll.find_one({"_id": conference_id})
            return doc
        except ServerSelectionTimeoutError as e:
            logger_instance.error("MongoDB load_state failed (timeout):", str(e))
            return None
        except Exception as e:
            logger_instance.error("MongoDB load_state failed:", str(e))
            return None
