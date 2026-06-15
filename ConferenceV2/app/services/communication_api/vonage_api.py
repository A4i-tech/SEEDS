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
from requests.adapters import HTTPAdapter
from requests.exceptions import ReadTimeout, ConnectionError as RequestsConnectionError
from pydantic import BaseModel
from app.conf_logger import logger_instance
from app.services.singletons.sas_gen import sas_gen
from config import get_settings

load_dotenv()

_VONAGE_RATE_LIMIT = 3  # max outbound call POSTs per second

# ROOT CAUSE of the 15.6-minute hang: Vonage SDK 2.x builds a bare
# requests.Session() and never passes a timeout to session.get/post/put. With
# no socket timeout, a non-responding Vonage endpoint leaves the underlying TCP
# read blocked forever. Because the conference event queue is sequential, that
# one blocked read stalls every queued action behind it.
#
# Two layers of defense, source-first:
#   1) _TimeoutHTTPAdapter (below) installs a real (connect, read) socket timeout
#      on the SDK session so the HTTP request itself fails fast with ReadTimeout —
#      this is what actually frees the worker thread. asyncio.wait_for alone
#      could NOT do this: it abandons the await but the to_thread worker keeps
#      running the blocked socket until the OS gives up, leaking threads.
#   2) asyncio.wait_for(_VONAGE_CALL_TIMEOUT_SECONDS) stays as a backstop for the
#      rare case a thread wedges for a non-socket reason.
_VONAGE_CALL_TIMEOUT_SECONDS = get_settings().VONAGE_CALL_TIMEOUT_SECONDS
_VONAGE_CONNECT_TIMEOUT_SECONDS = get_settings().VONAGE_CONNECT_TIMEOUT_SECONDS


class _TimeoutHTTPAdapter(HTTPAdapter):
    """HTTPAdapter that injects a default (connect, read) timeout on every send,
    so requests made by the Vonage SDK can never block the worker thread
    indefinitely. An explicit per-request timeout, if ever set, still wins."""

    def __init__(self, *args, timeout=None, **kwargs):
        self._timeout = timeout
        super().__init__(*args, **kwargs)

    def send(self, request, **kwargs):
        if kwargs.get("timeout") is None:
            kwargs["timeout"] = self._timeout
        return super().send(request, **kwargs)


def _install_session_timeout(client: "vonage.Client") -> None:
    """Mount a timeout-injecting adapter on the Vonage SDK's requests session.

    The SDK exposes its session as client.session; if that ever changes this is
    best-effort and the asyncio.wait_for backstop still bounds the call."""
    session = getattr(client, "session", None)
    if session is None:
        logger_instance.warning(
            "Vonage client has no .session attribute; cannot install socket "
            "timeout (asyncio.wait_for backstop still applies)"
        )
        return
    adapter = _TimeoutHTTPAdapter(
        timeout=(_VONAGE_CONNECT_TIMEOUT_SECONDS, _VONAGE_CALL_TIMEOUT_SECONDS)
    )
    session.mount("https://", adapter)
    session.mount("http://", adapter)


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
        )
        # Root-cause fix: give the SDK's timeout-less requests session a real
        # socket timeout so a stuck Vonage call fails fast instead of hanging.
        _install_session_timeout(self.client)
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
        # On timeout/error, treat the leg as not-answered so the caller moves on.
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
            # Isolate per-leg failures so one hung/stale leg doesn't strand the rest.
            try:
                call_details = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.client.voice.get_call, uuid=participant.call_leg_id
                    ),
                    timeout=_VONAGE_CALL_TIMEOUT_SECONDS,
                )
                if call_details["status"] == "answered":
                    logger_instance.info(
                        "ENDING CALL FOR PARTICIPANT", participant.phone_number
                    )
                    await asyncio.wait_for(
                        asyncio.to_thread(
                            self.client.voice.update_call,
                            uuid=participant.call_leg_id,
                            action="hangup",
                        ),
                        timeout=_VONAGE_CALL_TIMEOUT_SECONDS,
                    )
                else:
                    logger_instance.info(
                        "CALL ALREADY ENDED FOR PARTICIPANT", participant.phone_number
                    )
            except asyncio.TimeoutError:
                logger_instance.warning(
                    f"Vonage call timed out after {_VONAGE_CALL_TIMEOUT_SECONDS}s while "
                    f"ending leg for {participant.phone_number} ({participant.call_leg_id}); "
                    f"continuing with remaining participants"
                )
            except Exception as e:
                logger_instance.error(
                    f"Failed to end call leg for {participant.phone_number} "
                    f"({participant.call_leg_id}): {e}"
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
                await asyncio.wait_for(
                    asyncio.to_thread(create_talk, uuid=call_leg_id, text=text),
                    timeout=_VONAGE_CALL_TIMEOUT_SECONDS,
                )
                return True
            except Exception as e:
                logger_instance.error("Failed to play TTS via create_talk", e)

        try:
            await asyncio.wait_for(
                asyncio.to_thread(
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
                ),
                timeout=_VONAGE_CALL_TIMEOUT_SECONDS,
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

    async def _update_call_bounded(self, call_leg_id: str, action: str, phone_number: str):
        """
        Run a sync update_call in a thread, bounded by the Vonage timeout.
        Raises on timeout or SDK error (e.g. 400 on a leg that already ended)
        so callers don't update local state for an action that never happened.
        """
        try:
            await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.voice.update_call,
                    uuid=call_leg_id,
                    action=action,
                ),
                timeout=_VONAGE_CALL_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger_instance.warning(
                f"Vonage update_call ({action}) timed out after "
                f"{_VONAGE_CALL_TIMEOUT_SECONDS}s for {phone_number} ({call_leg_id})"
            )
            raise
        except Exception as e:
            logger_instance.error(
                f"Vonage update_call ({action}) failed for {phone_number} "
                f"({call_leg_id}): {e}"
            )
            raise

    # client.update_call()
    async def remove_participant(self, phone_number: str):
        """
        Removes a participant from an ongoing call.
        """
        participant_info = await self.redis_store.get_participant(
            self.conf_id, phone_number
        )
        if participant_info is None:
            # No leg to hang up (never answered, or already ended) — already removed.
            logger_instance.warning(
                f"No Vonage call leg found for {phone_number} in conference "
                f"{self.conf_id}; treating as already removed"
            )
            return
        await self._update_call_bounded(
            participant_info.call_leg_id, "hangup", phone_number
        )
        await self.redis_store.delete_participant(self.conf_id, phone_number)

    # client.update_call()
    async def mute_participant(self, phone_number: str):
        """
        Mutes a participant in the call.
        """
        participant_info = await self.redis_store.get_participant(self.conf_id, phone_number)
        if participant_info is None:
            raise ValueError(
                f"No Vonage call leg found for {phone_number} in conference {self.conf_id}"
            )
        await self._update_call_bounded(
            participant_info.call_leg_id, "mute", phone_number
        )

    # client.update_call()
    async def unmute_participant(self, phone_number: str):
        """
        Unmutes a participant in the call.
        """
        participant_info = await self.redis_store.get_participant(self.conf_id, phone_number)
        if participant_info is None:
            raise ValueError(
                f"No Vonage call leg found for {phone_number} in conference {self.conf_id}"
            )
        await self._update_call_bounded(
            participant_info.call_leg_id, "unmute", phone_number
        )
