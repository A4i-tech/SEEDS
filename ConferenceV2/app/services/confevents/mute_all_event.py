import asyncio
from datetime import datetime
from pydantic import BaseModel
from app.models.action_history import ActionHistory, ActionType
from app.services.confevents.base_event import ConferenceEvent
from app.models.participant import Role
from app.services.conference_call import ConferenceCall


class MuteAllEvent(ConferenceEvent):
    pass

