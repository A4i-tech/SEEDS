"""
Vonage API provider — REST operations for conference calls.

Ported from ConferenceV2 app/services/communication_api/vonage_api.py.

SECURITY:
  - API key / secret / private key are NEVER logged.
  - All Vonage SDK calls are offloaded to a thread-pool to avoid blocking the
    asyncio event loop (the Vonage 2.x SDK uses synchronous `requests`).
  - Rate-limit retries use exponential back-off + jitter.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import random
from typing import Any

from pydantic import BaseModel

try:
    from vonage.errors import ClientError  # type: ignore[import-untyped]
    from requests.exceptions import (  # type: ignore[import-untyped]
        ConnectionError as RequestsConnectionError,
        ReadTimeout,
    )
except ImportError:
    ClientError = Exception  # type: ignore[misc,assignment]
    ReadTimeout = Exception  # type: ignore[misc,assignment]
    RequestsConnectionError = Exception  # type: ignore[misc,assignment]

logger = logging.getLogger(__name__)

_VONAGE_RATE_LIMIT = 3  # max outbound call POSTs per second


class VonageParticipantInfo(BaseModel):
    """Call-leg metadata stored per participant in Redis."""

    phone_number: str
    call_leg_id: str
    initial_conv_id: str
    conference_conv_id: str | None = None


class VonageAPIProvider:
    """Thin async wrapper around the Vonage Voice API.

    All operations that call the synchronous Vonage SDK are dispatched via
    ``asyncio.to_thread`` so the event loop is never blocked.
    """

    def __init__(
        self,
        application_id: str,
        private_key: str,
        vonage_number: str,
        conf_id: str,
        ws_server_url: str = "",
        events_webhook_url: str = "",
        call_timeout_seconds: float = 30.0,
    ) -> None:
        import vonage  # type: ignore[import-untyped]

        self._application_id = application_id  # used by SDK, not logged
        self._vonage_number = vonage_number
        self.conf_id = conf_id
        self.ws_server_url = ws_server_url
        self.events_webhook_url = events_webhook_url
        self._call_timeout = call_timeout_seconds
        self.vonage_conv_id: str | None = None
        self.is_websocket_connected: bool = False
        self.teacher_phone_number: str | None = None
        self.redis_store: Any = None

        # Decode base64-encoded PEM key to a string if needed.
        # SDK accepts the PEM string directly — no temp file required.
        if "\n" not in private_key and not private_key.startswith("-----"):
            private_key = base64.b64decode(private_key).decode("utf-8")

        self._client = vonage.Client(
            application_id=application_id,
            private_key=private_key,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _create_call_with_retry(
        self,
        call_data: dict[str, Any],
        phone_number: str,
        max_retries: int = 5,
    ) -> dict[str, Any]:
        """Call voice.create_call with exponential back-off on 429/network errors."""
        for attempt in range(max_retries):
            try:
                resp = await asyncio.to_thread(self._client.voice.create_call, call_data)
                return resp
            except Exception as exc:
                is_rate_limited = isinstance(exc, ClientError) and "429 response from" in str(exc)
                is_network_error = isinstance(exc, (ReadTimeout, RequestsConnectionError))
                if (not is_rate_limited and not is_network_error) or attempt == max_retries - 1:
                    logger.error(
                        "vonage_api: create_call failed for phone_number=<redacted> attempt=%d — %s",
                        attempt,
                        type(exc).__name__,
                    )
                    raise
                delay = (2 ** attempt) + random.uniform(0, 1)
                reason = "rate_limited" if is_rate_limited else "network_error"
                logger.warning(
                    "vonage_api: %s for phone_number=<redacted>, retry %d/%d in %.2fs",
                    reason, attempt + 1, max_retries, delay,
                )
                await asyncio.sleep(delay)

        raise RuntimeError("unreachable")  # pragma: no cover

    async def _add_participant_to_conference(
        self,
        phone_number: str,
        start_muted: bool = False,
        announce_text: str | None = None,
        max_retries: int = 5,
    ) -> None:
        """Dial *phone_number* into the named Vonage conference."""
        conv_action: dict[str, Any] = {
            "action": "conversation",
            "name": self.conf_id,
        }
        if start_muted:
            conv_action["mute"] = True

        ncco: list[dict[str, Any]] = []
        if not start_muted:
            ncco.append({"action": "talk", "text": "Hi, welcome to SEEDS. Connecting you to the conference call."})
            ncco.append({"action": "talk", "text": f"{announce_text} has joined" if announce_text else "Teacher has joined"})
        else:
            ncco.append({"action": "talk", "text": f"{announce_text} has joined the conference." if announce_text else "You have joined the conference."})
        ncco.append(conv_action)

        call_data: dict[str, Any] = {
            "to": [{"type": "phone", "number": phone_number}],
            "from": {"type": "phone", "number": self._vonage_number},
            "event_url": [f"{self.events_webhook_url}/webhooks/event/{self.conf_id}"],
            "ncco": ncco,
        }

        resp = await self._create_call_with_retry(call_data, phone_number, max_retries)
        logger.info("vonage_api: call created conf_id=%s status=%s", self.conf_id, resp.get("status", "unknown"))

        if self.redis_store is not None:
            await self.redis_store.save_participant(
                self.conf_id,
                VonageParticipantInfo(
                    phone_number=phone_number,
                    call_leg_id=resp["uuid"],
                    initial_conv_id=resp["conversation_uuid"],
                ),
            )

    # ------------------------------------------------------------------
    # WebSocket attachment
    # ------------------------------------------------------------------

    async def _try_connecting_websocket_with_participant(
        self, participant: VonageParticipantInfo
    ) -> bool:
        """Transfer *participant*'s call leg to wire up the audio WebSocket."""
        try:
            call = await asyncio.wait_for(
                asyncio.to_thread(self._client.voice.get_call, uuid=participant.call_leg_id),
                timeout=self._call_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "vonage_api: get_call timed out after %.0fs for call_leg=%s",
                self._call_timeout, participant.call_leg_id,
            )
            return False
        except Exception as exc:
            logger.error("vonage_api: get_call failed call_leg=%s — %s", participant.call_leg_id, exc)
            return False

        if call.get("status") != "answered":
            logger.info(
                "vonage_api: cannot attach WS — call status=%s (need answered)", call.get("status")
            )
            return False

        logger.info("vonage_api: attaching websocket conf_id=%s ws_url=<redacted>", self.conf_id)
        try:
            await asyncio.wait_for(
                asyncio.to_thread(
                    self._client.voice.update_call,
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
                timeout=self._call_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "vonage_api: update_call (transfer) timed out after %.0fs for call_leg=%s",
                self._call_timeout, participant.call_leg_id,
            )
            return False
        except Exception as exc:
            logger.error("vonage_api: update_call (transfer) failed call_leg=%s — %s", participant.call_leg_id, exc)
            return False

        await asyncio.sleep(2)  # Allow Vonage to complete the transfer
        logger.info("vonage_api: websocket attached conf_id=%s", self.conf_id)
        return True

    def get_is_websocket_connected(self) -> bool:
        return self.is_websocket_connected

    # ------------------------------------------------------------------
    # Conference lifecycle
    # ------------------------------------------------------------------

    async def start_conf(self, teacher_phone: str, student_phones: list[str]) -> None:
        """Dial all participants into the conference.

        Calls are fired in batches of ``_VONAGE_RATE_LIMIT`` per second.
        """
        self.teacher_phone_number = teacher_phone
        participants = [(teacher_phone, False, None)] + [
            (sp, True, None) for sp in student_phones
        ]
        for i in range(0, len(participants), _VONAGE_RATE_LIMIT):
            batch = participants[i: i + _VONAGE_RATE_LIMIT]
            await asyncio.gather(
                *[self._add_participant_to_conference(ph, muted, text) for ph, muted, text in batch]
            )
            if i + _VONAGE_RATE_LIMIT < len(participants):
                await asyncio.sleep(1.0)

    async def end_conf(self) -> None:
        """Hang up every active call leg in the conference."""
        self.is_websocket_connected = False
        if self.redis_store is None:
            return
        participants = await self.redis_store.get_all_participants(self.conf_id)
        for participant in participants.values():
            try:
                call_details = await asyncio.to_thread(
                    self._client.voice.get_call, uuid=participant.call_leg_id
                )
                if call_details.get("status") == "answered":
                    await asyncio.to_thread(
                        self._client.voice.update_call,
                        uuid=participant.call_leg_id,
                        action="hangup",
                    )
            except Exception as exc:
                logger.warning(
                    "vonage_api: hangup failed for call_leg=%s — %s", participant.call_leg_id, exc
                )

    async def handle_call_transfer_event(
        self, uuid: str, conversation_uuid_to: str
    ) -> str | None:
        """Handle a Vonage call-transfer event; attach WebSocket if not yet connected."""
        if self.redis_store is None:
            return None
        participant = await self.redis_store.get_participant_by_leg_id(self.conf_id, uuid)
        if participant is None:
            return None

        if not self.vonage_conv_id:
            self.vonage_conv_id = conversation_uuid_to
        participant.conference_conv_id = conversation_uuid_to
        await self.redis_store.save_participant(self.conf_id, participant)

        if not self.is_websocket_connected:
            self.is_websocket_connected = await self._try_connecting_websocket_with_participant(participant)

        return participant.phone_number

    async def add_participant(self, phone_number: str, announce_text: str | None = None) -> None:
        """Add a new participant to a running conference."""
        start_muted = phone_number != self.teacher_phone_number
        await self._add_participant_to_conference(
            phone_number, start_muted=start_muted, announce_text=announce_text
        )

    async def remove_participant(self, phone_number: str) -> None:
        """Hang up *phone_number* and remove from Redis."""
        if self.redis_store is None:
            return
        participant = await self.redis_store.get_participant(self.conf_id, phone_number)
        if participant:
            await asyncio.to_thread(
                self._client.voice.update_call,
                uuid=participant.call_leg_id,
                action="hangup",
            )
            await self.redis_store.delete_participant(self.conf_id, phone_number)

    async def mute_participant(self, phone_number: str) -> None:
        """Mute *phone_number* via Vonage API."""
        if self.redis_store is None:
            return
        participant = await self.redis_store.get_participant(self.conf_id, phone_number)
        if participant:
            await asyncio.to_thread(
                self._client.voice.update_call,
                uuid=participant.call_leg_id,
                action="mute",
            )

    async def unmute_participant(self, phone_number: str) -> None:
        """Unmute *phone_number* via Vonage API."""
        if self.redis_store is None:
            return
        participant = await self.redis_store.get_participant(self.conf_id, phone_number)
        if participant:
            await asyncio.to_thread(
                self._client.voice.update_call,
                uuid=participant.call_leg_id,
                action="unmute",
            )

    async def play_announcement_to_conference(
        self, text: str, phone_numbers: list[str] | None = None
    ) -> None:
        """Play TTS *text* to each listed (or all) participant call legs."""
        if self.redis_store is None:
            return
        all_participants = await self.redis_store.get_all_participants(self.conf_id)
        recipients = phone_numbers or list(all_participants.keys())
        for phone_number in recipients:
            info = all_participants.get(phone_number)
            if not info:
                continue
            await self._play_tts_to_call_leg(info.call_leg_id, text)

    async def _play_tts_to_call_leg(self, call_leg_id: str, text: str) -> bool:
        create_talk = getattr(self._client.voice, "create_talk", None)
        if callable(create_talk):
            try:
                await asyncio.to_thread(create_talk, uuid=call_leg_id, text=text)
                return True
            except Exception as exc:
                logger.warning("vonage_api: create_talk failed call_leg=%s — %s", call_leg_id, exc)

        try:
            await asyncio.to_thread(
                self._client.voice.update_call,
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
        except Exception as exc:
            logger.warning("vonage_api: TTS transfer failed call_leg=%s — %s", call_leg_id, exc)
            return False

    async def reconnect_websocket(self) -> None:
        """Attempt to re-attach the audio WebSocket to an active participant."""
        if self.redis_store is None:
            return
        self.is_websocket_connected = False
        while not self.is_websocket_connected:
            participants = await self.redis_store.get_all_participants(self.conf_id)
            for participant in participants.values():
                if participant.conference_conv_id == self.vonage_conv_id:
                    self.is_websocket_connected = (
                        await self._try_connecting_websocket_with_participant(participant)
                    )
                    if self.is_websocket_connected:
                        return
            await asyncio.sleep(2)
