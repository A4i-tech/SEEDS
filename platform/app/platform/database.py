"""
Database module - AsyncIOMotorClient singleton.

SECURITY: Connection string is never logged; errors mask the full URI.
"""

from __future__ import annotations

import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)

_client: Optional[AsyncIOMotorClient] = None  # type: ignore[type-arg]
_database: Optional[AsyncIOMotorDatabase] = None  # type: ignore[type-arg]


def _extract_db_name(connection_string: str) -> str:
    """
    Parse the database name from a MongoDB connection string.
    Falls back to "seeds_platform" when no path component is present.
    """
    try:
        # Strip query string, then take the last path segment
        path = connection_string.split("?")[0]
        segments = [s for s in path.split("/") if s]
        # segments[-1] is the db name if the path has at least 4 parts (mongodb://host/db)
        if len(segments) >= 2:
            return segments[-1]
    except Exception:  # noqa: BLE001
        pass
    return "seeds_platform"


async def init_database() -> None:
    """Initialise the Motor client.  Called once from lifespan startup."""
    global _client, _database  # noqa: PLW0603

    settings = get_settings()
    conn_str = settings.effective_mongo_connection_string

    if not conn_str:
        logger.warning(
            "No MongoDB connection string configured; database operations will fail."
        )
        return

    try:
        _client = AsyncIOMotorClient(
            conn_str,
            maxPoolSize=settings.mongo_max_pool_size,
            serverSelectionTimeoutMS=5_000,
        )
        db_name = _extract_db_name(conn_str)
        _database = _client[db_name]
        # Lightweight connectivity check (does not require auth in all topologies)
        await _client.admin.command("ping")
        logger.info("MongoDB connected (db=%s, pool=%d)", db_name, settings.mongo_max_pool_size)
    except Exception as exc:  # noqa: BLE001
        # Mask the connection string in error messages
        safe_msg = str(exc).replace(conn_str, "<REDACTED>")
        logger.error("MongoDB connection failed: %s", safe_msg)
        raise RuntimeError(f"MongoDB connection failed: {safe_msg}") from exc


async def close_database() -> None:
    """Close the Motor client.  Called once from lifespan shutdown."""
    global _client, _database  # noqa: PLW0603

    if _client is not None:
        _client.close()
        logger.info("MongoDB connection closed.")
        _client = None
        _database = None


def get_database() -> AsyncIOMotorDatabase:  # type: ignore[type-arg]
    """
    Return the active database instance.

    Raises RuntimeError if init_database() has not been called yet.
    """
    if _database is None:
        raise RuntimeError(
            "Database not initialised. Ensure init_database() is called during application startup."
        )
    return _database
