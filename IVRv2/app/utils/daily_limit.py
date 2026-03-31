"""
Daily listening limit utilities for IVRv2.

Tracks and enforces per-student daily audio consumption limits.
Uses a dedicated MongoDB collection with atomic updates.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

from app.core.database import MongoDBCollection

# IST is UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))


def get_ist_date_string() -> str:
    """Get current date in IST as YYYY-MM-DD string."""
    return datetime.now(IST).strftime("%Y-%m-%d")


async def get_daily_usage(
    collection: MongoDBCollection,
    phone_number: str,
    date: str,
) -> int:
    """Get total listening seconds for a student on a given date.

    Args:
        collection: The dailyListeningUsage MongoDB collection.
        phone_number: Student's phone number.
        date: Date string in YYYY-MM-DD format.

    Returns:
        Total seconds consumed today, or 0 if no record exists.
    """
    doc = await collection.find_one_by_query(
        {"phone_number": phone_number, "date": date}
    )
    if doc is None:
        return 0
    return doc.get("total_seconds", 0)


async def increment_daily_usage(
    collection: MongoDBCollection,
    phone_number: str,
    date: str,
    seconds: int,
    tenant_id: str = "",
    school_id: str = "",
) -> None:
    """Atomically increment daily usage for a student.

    Uses upsert to create the document on first listen of the day.

    Args:
        collection: The dailyListeningUsage MongoDB collection.
        phone_number: Student's phone number.
        date: Date string in YYYY-MM-DD format.
        seconds: Duration in seconds to add.
        tenant_id: Tenant identifier.
        school_id: School identifier.
    """
    await collection.collection.update_one(
        {"phone_number": phone_number, "date": date},
        {
            "$inc": {"total_seconds": seconds},
            "$set": {
                "tenant_id": tenant_id,
                "school_id": school_id,
                "updated_at": datetime.now(IST),
            },
            "$setOnInsert": {
                "phone_number": phone_number,
                "date": date,
            },
        },
        upsert=True,
    )


async def is_limit_exceeded(
    collection: MongoDBCollection,
    phone_number: str,
    date: str,
    limit_seconds: int,
) -> bool:
    """Check if a student has exceeded their daily listening limit.

    Args:
        collection: The dailyListeningUsage MongoDB collection.
        phone_number: Student's phone number.
        date: Date string in YYYY-MM-DD format.
        limit_seconds: Maximum allowed seconds per day.

    Returns:
        True if limit is reached or exceeded.
    """
    usage = await get_daily_usage(collection, phone_number, date)
    return usage >= limit_seconds
