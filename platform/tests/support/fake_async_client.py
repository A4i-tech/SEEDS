"""Shared fake httpx.AsyncClient for webhook delivery tests."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any


class FakeAsyncClient:
    def __init__(self, outcomes: list[Any]) -> None:
        self._outcomes = list(outcomes)
        self.calls: list[dict[str, Any]] = []

    async def __aenter__(self) -> FakeAsyncClient:
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False

    @asynccontextmanager
    async def stream(self, method: str, url: str, **kwargs: Any):
        self.calls.append({"method": method, "url": url, **kwargs})
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        yield outcome
