import asyncio
from collections import defaultdict
from typing import Dict, Any, Tuple

class CallerStateManager:
    _instance = None
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CallerStateManager, cls).__new__(cls)
            cls._instance.states: Dict[str, Dict[str, Any]] = defaultdict(dict)
            cls._instance.versions: Dict[str, int] = defaultdict(int)
        return cls._instance

    async def update_state(self, conference_id: str, participant_id: str, new_state: Dict[str, Any]): 
        """
        Updates the state for a single participant and increments the version.
        """
        if participant_id not in self.states[conference_id]:
            self.states[conference_id][participant_id] = {}
        
        self.states[conference_id][participant_id].update(new_state) 
        
        # We still increment the version so the client can check if anything has changed.
        self.versions[conference_id] += 1

    async def get_current_state(self, conference_id: str) -> Tuple[Dict[str, Any], int]:
        """
        Immediately returns the entire current state for a conference.
        It does not wait or check the client's version.
        """
        current_state = self.states.get(conference_id, {})
        current_version = self.versions.get(conference_id, 0)
        return current_state, current_version

caller_state_manager = CallerStateManager()