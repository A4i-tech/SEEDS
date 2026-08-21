"""Async wrapper over `mongomock` because it does not support async PyMongo APIs."""

from __future__ import annotations

from typing import Any

import mongomock
import mongomock.collection

# mongomock 4.3.0 (latest on PyPI) predates pymongo 4.17's bulk write API, which
# now always passes sort= into UpdateOne/ReplaceOne's internal _add_to_bulk call
# even when unset. mongomock's add_update doesn't accept it — patch it to accept
# and discard sort so bulk_write() works under mongomock for any pymongo op type.
_real_add_update = mongomock.collection.BulkOperationBuilder.add_update
_patched = False


def _add_update_ignoring_sort(self, *args: Any, sort: Any = None, **kwargs: Any) -> Any:
    return _real_add_update(self, *args, **kwargs)


def _ensure_patched() -> None:
    global _patched
    if not _patched:
        mongomock.collection.BulkOperationBuilder.add_update = _add_update_ignoring_sort
        _patched = True


class _AsyncMongoMockCursor:
    def __init__(self, cursor: Any) -> None:
        self._cursor = cursor

    def sort(self, *args: Any, **kwargs: Any) -> _AsyncMongoMockCursor:
        self._cursor = self._cursor.sort(*args, **kwargs)
        return self

    def limit(self, *args: Any, **kwargs: Any) -> _AsyncMongoMockCursor:
        self._cursor = self._cursor.limit(*args, **kwargs)
        return self

    def skip(self, *args: Any, **kwargs: Any) -> _AsyncMongoMockCursor:
        self._cursor = self._cursor.skip(*args, **kwargs)
        return self

    async def to_list(self, length: int | None = None) -> list[Any]:
        docs = list(self._cursor)
        return docs if length is None else docs[:length]

    def __aiter__(self) -> _AsyncMongoMockCursor:
        self._iter = iter(self._cursor)
        return self

    async def __anext__(self) -> Any:
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration from None


class _AsyncMongoMockCollection:
    def __init__(self, collection: Any) -> None:
        self._collection = collection

    def find(self, *args: Any, **kwargs: Any) -> _AsyncMongoMockCursor:
        return _AsyncMongoMockCursor(self._collection.find(*args, **kwargs))

    async def aggregate(self, *args: Any, **kwargs: Any) -> _AsyncMongoMockCursor:
        return _AsyncMongoMockCursor(self._collection.aggregate(*args, **kwargs))

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._collection, name)

        async def _call(*args: Any, **kwargs: Any) -> Any:
            return attr(*args, **kwargs)

        return _call


class _AsyncMongoMockDatabase:
    def __init__(self, database: Any) -> None:
        self._database = database

    def __getitem__(self, name: str) -> _AsyncMongoMockCollection:
        return _AsyncMongoMockCollection(self._database[name])

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._database, name)

        async def _call(*args: Any, **kwargs: Any) -> Any:
            return attr(*args, **kwargs)

        return _call


class AsyncMongoMockClient:
    """Drop-in stand-in for `mongomock_motor.AsyncMongoMockClient` used by tests."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        _ensure_patched()
        self._client = mongomock.MongoClient(*args, **kwargs)

    def __getitem__(self, name: str) -> _AsyncMongoMockDatabase:
        return _AsyncMongoMockDatabase(self._client[name])

    @property
    def admin(self) -> _AsyncMongoMockDatabase:
        return _AsyncMongoMockDatabase(self._client.admin)

    async def close(self) -> None:
        self._client.close()
