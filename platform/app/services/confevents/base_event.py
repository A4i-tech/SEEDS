"""Abstract base class for all conference events."""
from __future__ import annotations

from abc import ABC, abstractmethod


class ConferenceEvent(ABC):
    """All conference events must implement ``execute_event``."""

    @abstractmethod
    async def execute_event(self) -> None:
        """Execute the event logic."""
