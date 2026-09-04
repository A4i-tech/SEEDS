"""Base repository — shared utilities for all PyMongo async repositories."""
from __future__ import annotations

from bson import ObjectId

from app.platform.error_handling import ValidationError


class BaseRepository:
    """Mixin providing common helpers for MongoDB document access."""

    @staticmethod
    def _to_oid(id_str: str) -> ObjectId:
        """Coerce a string to ObjectId, raising ValidationError when malformed.

        Use for fields that are always genuine ObjectId refs in the database
        (tenant_id, school_id, user _id) — a malformed value here means a real
        bug, not a legacy plain-string id, so fail loudly instead of silently
        querying with a raw string that will just match nothing.
        """
        try:
            return ObjectId(id_str)
        except Exception as exc:
            raise ValidationError(
                f"'{id_str}' is not a valid id. Use the exact 24-character id "
                "returned by the API, not a shortened or made-up value."
            ) from exc

    @staticmethod
    def _to_id(id_str: str) -> ObjectId | str:
        """Coerce a string to ObjectId when valid, otherwise keep as str.

        IVR and content collections use plain-string _ids; user/school
        collections use ObjectId. This handles both transparently.
        """
        try:
            return ObjectId(id_str)
        except Exception:
            return id_str

    @classmethod
    def _ids_query(cls, ids: list[str]) -> dict:
        """$in match for a list of ids, coercing each to ObjectId when valid."""
        return {"$in": [cls._to_id(i) for i in ids]}
