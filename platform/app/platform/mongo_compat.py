"""
Translation layer between Python string IDs and MongoDB ObjectId fields.

Legacy documents from backend-server store relational IDs (tenantId, schoolId, etc.)
as ObjectId. Platform code works with plain strings. This module bridges the gap
so queries match correctly without scattering ObjectId() casts everywhere.
"""
from __future__ import annotations

from bson import ObjectId


def as_oid(value: str | None) -> ObjectId | None:
    """Return an ObjectId if value is a valid 24-hex string, else return value as-is.

    Use this when building raw MongoDB query dicts for fields that were stored
    as ObjectId by the legacy backend-server (tenantId, schoolId, _id, etc.).

    Examples:
        {"tenantId": as_oid(tenant_id)}   # matches ObjectId in DB
        {"$in": [as_oid(sid) for sid in ids]}
    """
    if value and ObjectId.is_valid(value):
        return ObjectId(value)
    return value or None
