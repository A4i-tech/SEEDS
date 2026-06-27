"""
Caller state service — tracks per-participant call state for long-polling.

Ported from ConferenceV2 app/services/caller_state_manager.py.

This is a lightweight in-memory store keyed by (conference_id, participant_id).
It is intentionally simple; the authoritative state lives in MongoDB / Redis
via ConferenceCallState.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any


class CallerStateService:
    """Singleton in-memory store for per-participant transient state updates.

    Used by the caller-state long-poll endpoint to surface quick status
    changes (e.g. ON_HOLD) without a full DB round-trip.
    """

    _instance: CallerStateService | None = None

    def __new__(cls) -> CallerStateService:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._states: dict[str, dict[str, Any]] = defaultdict(dict)
            cls._instance._versions: dict[str, int] = defaultdict(int)
        return cls._instance

    async def update_state(
        self,
        conference_id: str,
        participant_id: str,
        new_state: dict[str, Any],
    ) -> None:
        """Merge *new_state* into the participant's state and increment version."""
        if participant_id not in self._states[conference_id]:
            self._states[conference_id][participant_id] = {}
        self._states[conference_id][participant_id].update(new_state)
        self._versions[conference_id] += 1

    async def get_current_state(
        self, conference_id: str
    ) -> tuple[dict[str, Any], int]:
        """Return the full state dict and current version for *conference_id*."""
        state = self._states.get(conference_id, {})
        version = self._versions.get(conference_id, 0)
        return state, version


# Module-level singleton — matches ConferenceV2's caller_state_manager pattern
caller_state_service = CallerStateService()
