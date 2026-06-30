from typing import List, Optional

from app.services.communication_api.base_communication_api import CommunicationAPI


class FakeCommunicationAPI(CommunicationAPI):
    """Fake implementation of CommunicationAPI for testing without Vonage."""

    def __init__(self, conf_id: str):
        self.conf_id = conf_id
        self.call_log: list[dict] = []

    async def start_conf(self, teacher_phone: str, student_phones: List[str]) -> str:
        self.call_log.append({
            "method": "start_conf",
            "teacher_phone": teacher_phone,
            "student_phones": student_phones,
        })
        return "fake-vonage-conf-id"

    async def end_conf(self):
        self.call_log.append({"method": "end_conf"})

    def reconnect_websocket(self):
        self.call_log.append({"method": "reconnect_websocket"})

    def get_is_websocket_connected(self) -> bool:
        self.call_log.append({"method": "get_is_websocket_connected"})
        return False

    async def add_participant(self, phone_number: str, announce_text: str | None = None):
        self.call_log.append({
            "method": "add_participant",
            "phone_number": phone_number,
            "announce_text": announce_text,
        })

    async def play_announcement_to_conference(
        self, text: str, phone_numbers: Optional[List[str]] = None
    ):
        self.call_log.append({
            "method": "play_announcement_to_conference",
            "text": text,
            "phone_numbers": phone_numbers,
        })

    async def remove_participant(self, phone_number: str):
        self.call_log.append({"method": "remove_participant", "phone_number": phone_number})

    async def mute_participant(self, phone_number: str):
        self.call_log.append({"method": "mute_participant", "phone_number": phone_number})

    async def unmute_participant(self, phone_number: str):
        self.call_log.append({"method": "unmute_participant", "phone_number": phone_number})
