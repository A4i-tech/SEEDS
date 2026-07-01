"""
Native (MongoDB) auth provider.

Ported from backend-server/src/auth/dbAdapters/nativeDb.js.

SECURITY: Passwords are verified with constant-time comparison; plain passwords
are never stored, returned, or logged.
"""

from __future__ import annotations

import logging
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.hashing import verify_password

logger = logging.getLogger(__name__)

_USERS_COLLECTION = "users"


async def get_user_by_credentials(
    email: str,
    password: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any] | None:
    """
    Look up a user by *email* and verify *password* against the stored bcrypt hash.

    Returns the user document (without the password field) on success, or None
    if no matching user exists or the password does not match.

    SECURITY: plain password is never logged.
    """
    user = await db[_USERS_COLLECTION].find_one({"email": email})
    if user is None:
        logger.debug("auth/native: no user found for email (redacted)")
        return None

    stored_hash: str = user.get("hashed_password", "")
    if not stored_hash or not verify_password(password, stored_hash):
        logger.debug("auth/native: password mismatch for user id=%s", user.get("_id"))
        return None

    # Strip the password hash before returning to callers.
    user.pop("hashed_password", None)
    return _normalise_id(user)


async def get_user_by_id(
    user_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any] | None:
    """
    Look up a user by *user_id* (ObjectId string).

    Returns the user document (without the password field), or None if not found.
    """
    try:
        oid = ObjectId(user_id)
    except Exception:  # noqa: BLE001
        logger.warning("auth/native: invalid user_id format: %s", user_id)
        return None

    user = await db[_USERS_COLLECTION].find_one({"_id": oid})
    if user is None:
        return None

    user.pop("password", None)
    return _normalise_id(user)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _normalise_id(doc: dict[str, Any]) -> dict[str, Any]:
    """Convert ObjectId _id to a plain string 'id' field for uniform handling."""
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc
