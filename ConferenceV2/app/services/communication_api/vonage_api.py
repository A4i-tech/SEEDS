import asyncio
import os
import random
from app.models.system_audio_messages import SystemAudioMessages
from app.services.communication_api import CommunicationAPI
from typing import Any, Dict, List, Optional
import json
from dotenv import load_dotenv
import vonage
from vonage.errors import ClientError
from requests.exceptions import ReadTimeout, ConnectionError as RequestsConnectionError
from pydantic import BaseModel
from app.conf_logger import logger_instance
from app.services.singletons.sas_gen import sas_gen
from config import get_settings

load_dotenv()

_VONAGE_RATE_LIMIT = 3  # max outbound call POSTs per second
_VONAGE_CALL_TIMEOUT_SECONDS = get_settings().VONAGE_CALL_TIMEOUT_SECONDS


class VonageParticipantInfo(BaseModel):
    phone_number: str
    call_leg_id: str
    initial_conv_id: str
    conference_conv_id: str | None = None


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
            application_id=self.application_id,
            private_key=self.private_key_path,
            timeout=_VONAGE_CALL_TIMEOUT_SECONDS,
        )
        self.redis_store = None
        self.teacher_phone_number = None
        self.is_websocket_connected = False

    async def _add_participant_to_call_with_system_message(
        self,
        phone_number: str,
        start_muted: bool = False,
        announce_text: str | None = None,
        max_retries: int = 5,
    ) -> None:
        conversation_action: Dict[str, Any] = {
            "action": "conversation",
            "name": self.conf_id,
        }
        if start_muted:
            conversation_action["mute"] = True

        ncco: List[Dict[str, Any]] = []
        if not start_muted:
            ncco.append({"action": "talk", "text": "Hi, welcome to SEEDS. Connecting you to the conference call."})
            ncco.append({"action": "talk", "text": f"{announce_text} has joined" if announce_text else "Teacher has joined"})
        else:
            ncco.append({"action": "talk", "text": f"{announce_text} has joined the conference." if announce_text else "You have joined the conference."})
        ncco.append(conversation_action)

        call_data = {
            "to": [{"type": "phone", "number": phone_number}],
            "from": {"type": "phone", "number": self.vonage_number},
            "event_url": [self.events_webhook_url + f"/webhooks/event/{self.conf_id}"],
            "ncco": ncco,
        }

        for attempt in range(max_retries):
            try:
                vonage_resp = await asyncio.to_thread(self.client.voice.create_call, call_data)
                logger_instance.info("VONAGE ADD PARTICIPANT RESPONSE", json.dumps(vonage_resp, indent=2))
                await self.redis_store.save_participant(self.conf_id, VonageParticipantInfo(
                    phone_number=phone_number,
                    call_leg_id=vonage_resp["uuid"],
                    initial_conv_id=vonage_resp["conversation_uuid"],
                ))
                return
            except Exception as e:
                is_rate_limited = isinstance(e, ClientError) and "429 response from" in str(e)
                is_network_error = isinstance(e, (ReadTimeout, RequestsConnectionError))
                if (not is_rate_limited and not is_network_error) or attempt == max_retries - 1:
                    logger_instance.error(f"Call failed for {phone_number}", e)
                    raise
                delay = (2 ** attempt) + random.uniform(0, 1)
                reason = "Rate limited" if is_rate_limited else "Network error"
                logger_instance.warning(
                    f"{reason} adding {phone_number}, retry {attempt + 1}/{max_retries} in {delay:.2f}s"
                )
                await asyncio.sleep(delay)

    async def _try_connecting_websocket_with_participant(
        self, participant: VonageParticipantInfo
    ):
        """
        Connecting websocket to this conference call, requires an active call leg.
        The user with active call leg is transferred into a new NCCO which first connects a websocket to the user's call leg
        and then transfers both - user's call leg and the websocket, back into the conference

        Returns True if the above process happened for the given participant
        """
        # Bound this single sync Vonage call. The Vonage 2.x SDK uses requests
        # with no default timeout, so a non-responding leg used to freeze the
        # event loop for 15+ minutes. On timeout, treat the leg as not-answered
        # so the caller can move on (matches the existing else-branch semantics
        # below, where a non-"answered" status returns False).
        try:
            call = await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.voice.get_call, uuid=participant.call_leg_id
                ),
                timeout=_VONAGE_CALL_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger_instance.warning(
                f"Vonage get_call timed out after {_VONAGE_CALL_TIMEOUT_SECONDS}s "
                f"for {participant.phone_number} ({participant.call_leg_id}); "
                f"treating as not-answered"
            )
            return False
        # Non-timeout SDK/network errors (404 stale leg, 401 auth, connection
        # reset, etc.) used to propagate and crash callers (handle_call_transfer_event,
        # reconnect_websocket). Match the timeout semantics — log + return False.
        except Exception as e:
            logger_instance.error(
                f"Vonage get_call failed for {participant.phone_number} "
                f"({participant.call_leg_id}): {e}"
            )
            return False
        logger_instance.info(
            f'Checking participant {participant.phone_number} call status: {call["status"]}'
        )
        if call["status"] == "answered":
            logger_instance.info(
                f"CONNECTING WEBSOCKET TO THE CONFERENCE {self.conf_id} USING NUMBER {participant.phone_number} URL: {self.ws_server_url}"
            )
            # Bound this sync update_call too. Same SDK, same no-default-timeout
            # problem as get_call above — without this, a hung transfer would
            # freeze the event loop.
            try:
                await asyncio.wait_for(
                    asyncio.to_thread(
                        self.client.voice.update_call,
                        uuid=participant.call_leg_id,
                        params={
                            "action": "transfer",
                            "destination": {
                                "type": "ncco",
                                "ncco": [
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
                    ),
                    timeout=_VONAGE_CALL_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                logger_instance.warning(
                    f"Vonage update_call (transfer) timed out after "
                    f"{_VONAGE_CALL_TIMEOUT_SECONDS}s for "
                    f"{participant.phone_number} ({participant.call_leg_id})"
                )
                return False
            except Exception as e:
                logger_instance.error(
                    f"Vonage update_call (transfer) failed for "
                    f"{participant.phone_number} ({participant.call_leg_id}): {e}"
                )
                return False
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
        participant = await self.redis_store.get_participant_by_leg_id(self.conf_id, uuid)
        logger_instance.info(
            f"Found participant for UUID {uuid}: {participant.phone_number if participant else 'None'}"
        )

        if participant:
            if not self.vonage_conv_id:
                self.vonage_conv_id = conversation_uuid_to

            participant.conference_conv_id = conversation_uuid_to
            await self.redis_store.save_participant(self.conf_id, participant)
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
        Students are muted by default when they join.

        Calls are fired in parallel batches of _VONAGE_RATE_LIMIT (3/s) to stay
        within Vonage's outbound call creation rate limit. Each individual call
        retries with exponential backoff + jitter on 429 responses.
        """
        self.teacher_phone_number = teacher_phone

        # (teacher, muted, announce_text) tuples — teacher first
        participants = [(teacher_phone, False, None)] + [
            (sp, True, None) for sp in student_phones
        ]

        for i in range(0, len(participants), _VONAGE_RATE_LIMIT):
            batch = participants[i : i + _VONAGE_RATE_LIMIT]
            await asyncio.gather(
                *[self._add_participant_to_call_with_system_message(ph, muted, text) for ph, muted, text in batch]
            )
            if i + _VONAGE_RATE_LIMIT < len(participants):
                await asyncio.sleep(1.0)

    # client.update_call()
    async def end_conf(self):
        """
        Ends a call by its conference ID using the Vonage API.
        """
        self.is_websocket_connected = False
        for participant in (await self.redis_store.get_all_participants(self.conf_id)).values():
            call_details = await asyncio.to_thread(self.client.voice.get_call, uuid=participant.call_leg_id)
            if call_details["status"] == "answered":
                logger_instance.info(
                    "ENDING CALL FOR PARTICIPANT", participant.phone_number
                )
                await asyncio.to_thread(
                    self.client.voice.update_call,
                    uuid=participant.call_leg_id,
                    action="hangup",
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
            participants = await self.redis_store.get_all_participants(self.conf_id)
            for participant in participants.values():
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
    async def add_participant(
        self, phone_number: str, announce_text: str | None = None
    ):
        """
        Adds a participant to an ongoing call.
        Students are muted by default when they join.
        """
        start_muted = True  # Default to muted for students

        if self.teacher_phone_number == phone_number:
            start_muted = False  # Teacher is not muted

        # Pass announce_text if provided; otherwise no TTS for adds without name.
        await self._add_participant_to_call_with_system_message(
            phone_number, start_muted=start_muted, announce_text=announce_text or None
        )

    async def _play_tts_to_call_leg(self, call_leg_id: str, text: str) -> bool:
        create_talk = getattr(self.client.voice, "create_talk", None)
        if callable(create_talk):
            try:
                await asyncio.to_thread(create_talk, uuid=call_leg_id, text=text)
                return True
            except Exception as e:
                logger_instance.error("Failed to play TTS via create_talk", e)

        try:
            await asyncio.to_thread(
                self.client.voice.update_call,
                uuid=call_leg_id,
                params={
                    "action": "transfer",
                    "destination": {
                        "type": "ncco",
                        "ncco": [
                            {"action": "talk", "text": text},
                            {"action": "conversation", "name": self.conf_id},
                        ],
                    },
                },
            )
            return True
        except Exception as e:
            logger_instance.error("Failed to play TTS via transfer", e)
            return False

    async def play_announcement_to_conference(
        self, text: str, phone_numbers: Optional[List[str]] = None
    ):
        """
        Play TTS to each active participant call leg.
        """
        all_participants = await self.redis_store.get_all_participants(self.conf_id)
        recipients = phone_numbers or list(all_participants.keys())
        if not recipients:
            return

        for phone_number in recipients:
            participant_info = all_participants.get(phone_number)
            if not participant_info:
                continue
            await self._play_tts_to_call_leg(participant_info.call_leg_id, text)

    # client.update_call()
    async def remove_participant(self, phone_number: str):
        """
        Removes a participant from an ongoing call.
        """
        participant_info = await self.redis_store.get_participant(self.conf_id, phone_number)
        if participant_info:
            await asyncio.to_thread(
                self.client.voice.update_call,
                uuid=participant_info.call_leg_id,
                action="hangup",
            )
            await self.redis_store.delete_participant(self.conf_id, phone_number)

    # client.update_call()
    async def mute_participant(self, phone_number: str):
        """
        Mutes a participant in the call.
        """
        participant_info = await self.redis_store.get_participant(self.conf_id, phone_number)
        if participant_info:
            await asyncio.to_thread(
                self.client.voice.update_call,
                uuid=participant_info.call_leg_id,
                action="mute",
            )

    # client.update_call()
    async def unmute_participant(self, phone_number: str):
        """
        Unmutes a participant in the call.
        """
        participant_info = await self.redis_store.get_participant(self.conf_id, phone_number)
        if participant_info:
            await asyncio.to_thread(
                self.client.voice.update_call,
                uuid=participant_info.call_leg_id,
                action="unmute",
            )
