"""Shared fake httpx.AsyncClient for webhook delivery tests."""

from __future__ import annotations

from typing import Any

import httpx


class FakeAsyncClient:
    def __init__(self, outcomes: list[Any]) -> None:
        self._outcomes = list(outcomes)
        self.calls: list[dict[str, Any]] = []

    async def __aenter__(self) -> FakeAsyncClient:
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        self.calls.append({"url": url, **kwargs})
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome
