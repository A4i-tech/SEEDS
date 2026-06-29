"""
Resource ownership authorization guard.

assert_conference_owner() verifies that the calling user created the
conference they are attempting to access.

SECURITY:
  - Denial is logged via audit.log_denial before ForbiddenError is raised.
"""

from __future__ import annotations

import logging
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.authz.audit import log_denial
from app.platform.error_handling import ForbiddenError, NotFoundError

logger = logging.getLogger(__name__)


async def assert_conference_owner(
    current_user: dict[str, Any],
    conference_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> None:
    """
    Verify that *current_user* is the creator of *conference_id*.

    Fetches the conference from the 'conferenceState' collection and checks
    that conference.created_by == current_user["sub"].

    Raises NotFoundError if the conference does not exist.
    Raises ForbiddenError if the caller is not the owner.
    """
    # Try both plain-string and ObjectId lookups.
    query: dict[str, Any] = {"conference_id": conference_id}
    conference = await db["conferenceState"].find_one(query)
    if conference is None:
        # Fallback: treat conference_id as the MongoDB _id.
        try:
            oid = ObjectId(conference_id)
            conference = await db["conferenceState"].find_one({"_id": oid})
        except Exception:  # nosec B110 — intentional fallback when id is not a valid ObjectId
            logger.debug("ownership: conference_id %r is not a valid ObjectId", conference_id)

    if conference is None:
        raise NotFoundError("Conference", conference_id)

    created_by = str(conference.get("created_by", ""))
    caller_id = str(current_user.get("sub", ""))

    if created_by != caller_id:
        log_denial(
            user_id=caller_id,
            resource=f"conference:{conference_id}",
            action="access",
            reason="not_owner",
        )
        raise ForbiddenError("not conference owner")
