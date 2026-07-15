"""Base repository — shared utilities for all Motor async repositories."""
from __future__ import annotations

from typing import Any

from bson import ObjectId


class BaseRepository:
    """Mixin providing common helpers for MongoDB document access."""

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
