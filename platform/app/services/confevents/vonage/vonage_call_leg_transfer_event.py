"""Vonage call leg transfer event."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.services.confevents.base_event import ConferenceEvent

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall
logger = logging.getLogger(__name__)

class VonageCallTransferEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall, conversation_uuid_from: str, type: str, uuid: str, conversation_uuid_to: str, timestamp: str) -> None:
        self.conf_call = conf_call
        self.conversation_uuid_from = conversation_uuid_from
        self.type = type
        self.uuid = uuid
        self.conversation_uuid_to = conversation_uuid_to
        self.timestamp = timestamp

    async def execute_event(self) -> None:
        from app.providers.vonage_api import VonageAPIProvider  # noqa: PLC0415
        comm_api = self.conf_call.communication_api
        if isinstance(comm_api, VonageAPIProvider):
            ph = await comm_api.handle_call_transfer_event(self.uuid, self.conversation_uuid_to)
            if ph:
                logger.info("vonage_transfer: participant transferred into conference conf=%s", self.conf_call.conf_id)

    def __str__(self) -> str:
        return f"conversation_uuid_from={self.conversation_uuid_from} uuid={self.uuid} to={self.conversation_uuid_to}"
