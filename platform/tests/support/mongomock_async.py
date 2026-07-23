"""In-repo async shim over sync `mongomock`, standing in for PyMongo's async API in tests.

`mongomock` has no native support for `pymongo`'s async API (mongomock/mongomock#916,
open/unresolved). This wraps the existing sync `mongomock.MongoClient`: `find()` returns
a cursor wrapper with async iteration/`to_list`, and every other collection/database
method (`insert_one`, `replace_one`, `insert_many`, `command`, ...) is proxied generically
through `__getattr__` into a same-named `async def` that calls straight through to the
sync mongomock method — matching how Motor auto-wraps the full pymongo sync surface.
Tests swap `mongomock_motor.AsyncMongoMockClient` for `AsyncMongoMockClient` here with a
one-line import change and no fixture rewrites.
"""

from __future__ import annotations

from typing import Any

import mongomock


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
        self._client = mongomock.MongoClient(*args, **kwargs)

    def __getitem__(self, name: str) -> _AsyncMongoMockDatabase:
        return _AsyncMongoMockDatabase(self._client[name])

    @property
    def admin(self) -> _AsyncMongoMockDatabase:
        return _AsyncMongoMockDatabase(self._client.admin)

    async def close(self) -> None:
        self._client.close()
