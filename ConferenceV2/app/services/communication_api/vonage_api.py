import asyncio
import os
from app.models.system_audio_messages import SystemAudioMessages
from app.services.communication_api import CommunicationAPI
from typing import Any, Dict, List, Optional
import json
from dotenv import load_dotenv
import vonage
from typing import Dict
from pydantic import BaseModel
from app.conf_logger import logger_instance
from app.services.singletons.sas_gen import sas_gen


class VonageParticipantInfo(BaseModel):
    phone_number: str
    call_leg_id: str
    initial_conv_id: str
    conference_conv_id: str = None


load_dotenv()


class VonageAPI(CommunicationAPI):
    def __init__(
        self,
        application_id: str,
        private_key_path: str,
        vonage_number: str,
        conf_id: str,
        ws_server_url: str = "",
    ):
        self.ws_server_url = ws_server_url
        self.events_webhook_url = os.environ.get("EVENTS_WEBHOOK_EP", "")
        self.application_id = application_id
        self.private_key_path = private_key_path
        self.vonage_number = vonage_number
        self.conf_id = conf_id
        self.vonage_conv_id = None
        self.client = vonage.Client(
            application_id=self.application_id, private_key=self.private_key_path
        )
        self.participant_info_map: Dict[str, VonageParticipantInfo] = {}
        self.teacher_phone_number = None
        self.is_websocket_connected = False

    def _add_participant_to_call_with_system_message(
        self, phone_number: str, welcome_message: SystemAudioMessages
    ):
        call_payload = {"type": "phone", "number": phone_number}

        # Build audio stream websocket URL for hold detection
        audio_stream_url = f"{self.events_webhook_url.replace('http://', 'ws://').replace('https://', 'wss://')}/audio-stream/{self.conf_id}/{phone_number}"

        call_data = {
            "to": [call_payload],
            "from": {"type": "phone", "number": self.vonage_number},
            "event_url": [self.events_webhook_url + f"/webhooks/event/{self.conf_id}"],
            "ncco": [
                {
                    "action": "stream",
                    "streamUrl": [sas_gen.get_url_with_sas(welcome_message.value)],
                },
                # Connect audio stream websocket for real-time hold detection
                {
                    "action": "connect",
                    "eventUrl": [
                        self.events_webhook_url + f"/webhooks/event/{self.conf_id}"
                    ],
                    "from": f"AudioMonitor-{phone_number}",
                    "endpoint": [
                        {
                            "type": "websocket",
                            "uri": audio_stream_url,
                            "content-type": "audio/l16;rate=16000",
                            "headers": {
                                "X-Participant": phone_number,
                                "X-Conference-ID": self.conf_id,
                            },
                        }
                    ],
                },
                {"action": "conversation", "name": self.conf_id},
            ],
        }

        vonage_resp = self.client.voice.create_call(call_data)
        logger_instance.info(
            "VONAGE ADD PARTICIPANT RESPONSE", json.dumps(vonage_resp, indent=2)
        )

        participant_call_leg_id = vonage_resp["uuid"]

        # Store participant info
        self.participant_info_map[phone_number] = VonageParticipantInfo(
            phone_number=phone_number,
            call_leg_id=participant_call_leg_id,
            initial_conv_id=vonage_resp["conversation_uuid"],
        )

        # Now create a separate audio monitoring WebSocket connection
        # that ONLY listens to this specific participant using canHear
        self._create_audio_monitor_for_participant(
            phone_number, participant_call_leg_id
        )

    def _create_audio_monitor_for_participant(
        self, phone_number: str, participant_call_leg_id: str
    ):
        """
        Creates a dedicated audio monitoring WebSocket that ONLY listens to a specific participant.

        Uses Vonage's selective audio control (canHear) to isolate this participant's audio
        for real-time hold detection without interference from other participants.
        """
        audio_stream_url = f"{self.events_webhook_url.replace('http://', 'ws://').replace('https://', 'wss://')}/audio-stream/{self.conf_id}/{phone_number}"

        logger_instance.info(
            f"[AUDIO MONITOR] Creating selective audio monitor for {phone_number} (leg: {participant_call_leg_id})"
        )
        print(
            f"[AUDIO MONITOR] 🎧 Setting up selective audio stream for {phone_number}\n"
            f"  Call Leg ID: {participant_call_leg_id}\n"
            f"  WebSocket URL: {audio_stream_url}\n"
        )

        # Create a new call leg that's just a WebSocket listening to this participant
        audio_monitor_call_data = {
            "to": [
                {
                    "type": "websocket",
                    "uri": audio_stream_url,
                    "content-type": "audio/l16;rate=16000",
                    "headers": {
                        "X-Participant-Phone": phone_number,
                        "X-Participant-Leg-ID": participant_call_leg_id,
                        "X-Conference-ID": self.conf_id,
                    },
                }
            ],
            "from": {"type": "phone", "number": self.vonage_number},
            "event_url": [self.events_webhook_url + f"/webhooks/event/{self.conf_id}"],
            "answer_url": [
                self.events_webhook_url
                + f"/webhooks/audio-monitor-answer/{self.conf_id}/{phone_number}"
            ],
            "ncco": [
                {
                    "action": "conversation",
                    "name": self.conf_id,
                    # SELECTIVE AUDIO: Only hear this specific participant
                    "canHear": [participant_call_leg_id],
                    # Don't send any audio back (monitor only)
                    "canSpeak": [],
                }
            ],
        }

        try:
            monitor_resp = self.client.voice.create_call(audio_monitor_call_data)
            logger_instance.info(
                f"[AUDIO MONITOR] Created audio monitor for {phone_number}: {json.dumps(monitor_resp, indent=2)}"
            )
            print(
                f"[AUDIO MONITOR] ✅ Audio monitor active for {phone_number}\n"
                f"  Monitor Leg ID: {monitor_resp['uuid']}\n"
            )
        except Exception as e:
            logger_instance.error(
                f"[AUDIO MONITOR] Error creating audio monitor for {phone_number}: {e}"
            )
            print(
                f"[AUDIO MONITOR] ❌ Failed to create monitor for {phone_number}: {e}\n"
            )

    async def _try_connecting_websocket_with_participant(
        self, participant: VonageParticipantInfo
    ):
        """
        Connecting websocket to this conference call, requires an active call leg.
        The user with active call leg is transferred into a new NCCO which first connects a websocket to the user's call leg
        and then transfers both - user's call leg and the websocket, back into the conference

        Returns True if the above process happened for the given participant
        """
        call = self.client.voice.get_call(uuid=participant.call_leg_id)
        logger_instance.info(
            f'Checking participant {participant.phone_number} call status: {call["status"]}'
        )
        if call["status"] == "answered":
            logger_instance.info(
                f"CONNECTING WEBSOCKET TO THE CONFERENCE {self.conf_id} USING NUMBER {participant.phone_number} URL: {self.ws_server_url}"
            )
            self.client.voice.update_call(
                uuid=participant.call_leg_id,
                params={
                    "action": "transfer",
                    "destination": {
                        "type": "ncco",
                        "ncco": [
                            # {
                            #     "action": "talk",
                            #     "text": "Connecting websocket"
                            # },
                            {
                                "action": "connect",
                                "from": "SEEDS-ConfV2",
                                "endpoint": [
                                    {
                                        "type": "websocket",
                                        "uri": self.ws_server_url,
                                        "content-type": "audio/l16;rate=8000",
                                    }
                                ],
                            },
                            {"action": "conversation", "name": self.conf_id},
                        ],
                    },
                },
            )
            # Say it takes 2 seconds for vonage to connect the websocket to the conference.
            # TODO: Figure out a way around this assumption
            await asyncio.sleep(2)
            logger_instance.info(
                f"WebSocket connection established for conference {self.conf_id}"
            )
            return True
        else:
            logger_instance.info(
                f'Cannot connect WebSocket - participant {participant.phone_number} call status is {call["status"]} (need "answered")'
            )
        return False

    def get_is_websocket_connected(self) -> bool:
        return self.is_websocket_connected

    async def handle_call_transfer_event(self, uuid: str, conversation_uuid_to: str):
        """
        Find the participant which was just put into the conference.
        If websocket is not connected, use this participant to connect the websocket to conference.

        Return participant phone number or None
        """
        logger_instance.info(
            f"Handling call transfer event - UUID: {uuid}, conversation_uuid_to: {conversation_uuid_to}"
        )
        participant = next(
            (p for p in self.participant_info_map.values() if p.call_leg_id == uuid),
            None,
        )
        logger_instance.info(
            f"Found participant for UUID {uuid}: {participant.phone_number if participant else 'None'}"
        )

        if participant:
            if not self.vonage_conv_id:
                self.vonage_conv_id = conversation_uuid_to

            participant.conference_conv_id = conversation_uuid_to
            logger_instance.info(
                f"WebSocket connected status: {self.is_websocket_connected}"
            )
            if not self.is_websocket_connected:
                logger_instance.info(
                    f"Attempting to connect WebSocket for participant {participant.phone_number}"
                )
                self.is_websocket_connected = (
                    await self._try_connecting_websocket_with_participant(participant)
                )
                logger_instance.info(
                    f"WebSocket connection result: {self.is_websocket_connected}"
                )
            else:
                logger_instance.info(
                    "WebSocket already connected, skipping connection attempt"
                )
            return participant.phone_number

        return None

    async def start_conf(self, teacher_phone: str, student_phones: List[str]):
        """
        Starts a conference call between a teacher and students using Vonage API.
        """
        self.teacher_phone_number = teacher_phone
        self._add_participant_to_call_with_system_message(
            teacher_phone, SystemAudioMessages.WELCOME_TEACHER
        )

        for student_phone in student_phones:
            self._add_participant_to_call_with_system_message(
                student_phone, SystemAudioMessages.WELCOME_STUDENT
            )

    # client.update_call()
    async def end_conf(self):
        """
        Ends a call by its conference ID using the Vonage API.
        """
        self.is_websocket_connected = False
        for participant in self.participant_info_map.values():
            call_details = self.client.voice.get_call(uuid=participant.call_leg_id)
            if call_details["status"] == "answered":
                logger_instance.info(
                    "ENDING CALL FOR PARTICIPANT", participant.phone_number
                )
                self.client.voice.update_call(
                    uuid=participant.call_leg_id, action="hangup"
                )
            else:
                logger_instance.info(
                    "CALL ALREADY ENDED FOR PARTICIPANT", participant.phone_number
                )

    async def reconnect_websocket(self):
        """
        Go through latest call statuses for all participants and on finding the first "answered" call leg,
        try connecting the websocket
        """
        self.is_websocket_connected = False
        while not self.is_websocket_connected:
            for participant_ph_number in self.participant_info_map:
                participant = self.participant_info_map[participant_ph_number]
                if (
                    participant.conference_conv_id == self.vonage_conv_id
                ):  # The participant is already in the conference
                    self.is_websocket_connected = (
                        await self._try_connecting_websocket_with_participant(
                            participant
                        )
                    )
                    if self.is_websocket_connected:
                        break
                # VERY IMPORTANT : Stuck event loop otherwise
                await asyncio.sleep(2)

    # client.create_call()
    async def add_participant(self, phone_number: str):
        """
        Adds a participant to an ongoing call.
        """
        welcome_message = SystemAudioMessages.WELCOME_STUDENT
        if self.teacher_phone_number == phone_number:
            welcome_message = SystemAudioMessages.WELCOME_TEACHER

        self._add_participant_to_call_with_system_message(phone_number, welcome_message)

    # client.update_call()
    async def remove_participant(self, phone_number: str):
        """
        Removes a participant from an ongoing call.
        """
        if phone_number in self.participant_info_map:
            participant_info = self.participant_info_map[phone_number]
            self.client.voice.update_call(
                uuid=participant_info.call_leg_id, action="hangup"
            )
            del self.participant_info_map[phone_number]

    # client.update_call()
    async def mute_participant(self, phone_number: str):
        """
        Mutes a participant in the call.
        """
        if phone_number in self.participant_info_map:
            participant_info = self.participant_info_map[phone_number]
            self.client.voice.update_call(
                uuid=participant_info.call_leg_id, action="mute"
            )

    # client.update_call()
    async def unmute_participant(self, phone_number: str):
        """
        Unmutes a participant in the call.
        """
        if phone_number in self.participant_info_map:
            participant_info = self.participant_info_map[phone_number]
            self.client.voice.update_call(
                uuid=participant_info.call_leg_id, action="unmute"
            )
