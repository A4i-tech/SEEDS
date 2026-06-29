"""Structural protocols for audio pipeline components.

Using Protocol rather than concrete imports avoids circular imports in consumers
that lazily load AudioTranscriber / HoldDetector at call time.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class TranscriberProtocol(Protocol):
    async def process_chunk(self, audio_data: bytes) -> dict[str, Any] | None: ...


@runtime_checkable
class HoldDetectorProtocol(Protocol):
    async def detect(self, text: str) -> dict[str, Any]: ...
