# File: ConferenceV2/app/services/caller_state_manager.py

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
            cls._instance.events: Dict[str, asyncio.Event] = defaultdict(asyncio.Event)
        return cls._instance

    async def update_state(self, conference_id: str, participant_id: str, new_state: Dict[str, Any]): # <-- RENAMED THIS ARGUMENT
        if participant_id not in self.states[conference_id]:
            self.states[conference_id][participant_id] = {}
        
        self.states[conference_id][participant_id].update(new_state) # <-- Also change the variable here
        
        self.versions[conference_id] += 1
        self.events[conference_id].set()
        self.events[conference_id].clear()

    async def get_state_since_version(self, conference_id: str, known_version: int, timeout: int = 25) -> Tuple[Dict[str, Any], int]:
        current_version = self.versions[conference_id]
        if current_version > known_version:
            return self.states[conference_id], current_version
        try:
            await asyncio.wait_for(self.events[conference_id].wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass 
        return self.states[conference_id], self.versions[conference_id]

caller_state_manager = CallerStateManager()