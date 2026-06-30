"""
Abstract base class for all async consumers.

Consumers are started as asyncio background tasks from the lifespan.
Each consumer:
  - Runs a main loop (``run``) with transient-error retry + exponential back-off.
  - Delegates per-message logic to the abstract ``process`` method.
  - Dead-letters permanent failures and continues the loop.
"""

from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)

MAX_TRANSIENT_RETRIES = 3
INITIAL_BACKOFF = 1.0  # seconds
MAX_BACKOFF = 30.0


class BaseConsumer(ABC):
    """Abstract base for all queue/stream consumers."""

    name: str = "consumer"

    async def run(self) -> None:
        """Main loop — override only if the consumer needs a custom loop."""
        logger.info("%s: started", self.name)
        while True:
            try:
                await self._run_loop()
            except asyncio.CancelledError:
                logger.info("%s: cancelled", self.name)
                return
            except Exception as exc:
                logger.exception("%s: unexpected top-level error — %s; restarting", self.name, exc)
                await asyncio.sleep(INITIAL_BACKOFF)

    async def _run_loop(self) -> None:
        """Override in subclasses that need to pull messages from an external source."""
        raise NotImplementedError

    @abstractmethod
    async def process(self, message: Any) -> None:
        """Process a single message.

        Transient errors should raise; ``_safe_process`` will retry.
        Permanent errors should raise ``PermanentError``.
        """

    async def _safe_process(self, message: Any) -> None:
        """Wrap ``process`` with retry / dead-letter logic."""
        last_exc: Exception | None = None
        for attempt in range(1, MAX_TRANSIENT_RETRIES + 1):
            try:
                await self.process(message)
                return
            except PermanentError as exc:
                logger.error("%s: permanent error — %s; dead-lettering message", self.name, exc)
                await self._dead_letter(message, reason=str(exc))
                return
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                last_exc = exc
                backoff = min(INITIAL_BACKOFF * 2 ** (attempt - 1), MAX_BACKOFF)
                logger.warning(
                    "%s: transient error attempt %d/%d — %s; retrying in %.1fs",
                    self.name, attempt, MAX_TRANSIENT_RETRIES, exc, backoff,
                )
                await asyncio.sleep(backoff)

        # All retries exhausted
        logger.error("%s: all retries failed — dead-lettering message: %s", self.name, last_exc)
        await self._dead_letter(message, reason=str(last_exc))

    async def _dead_letter(self, message: Any, reason: str) -> None:
        """Override in subclasses to persist dead-lettered messages."""
        logger.error("%s: dead-letter message=%r reason=%s", self.name, message, reason)


class PermanentError(Exception):
    """Raised to indicate that a message should be dead-lettered without retrying."""
