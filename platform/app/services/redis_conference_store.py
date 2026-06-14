"""
Redis-backed conference state store.

Ported from ConferenceV2 app/services/redis_conference_store.py.

SECURITY: Redis URL contains credentials and is NEVER logged.
"""

from __future__ import annotations

import json
import logging

from app.models.conference_state import ConferenceCallState
from app.providers.vonage_api import VonageParticipantInfo

logger = logging.getLogger(__name__)


class RedisConferenceStore:
    """Async Redis store for conference state and per-participant call-leg info."""

    def __init__(self) -> None:
        import redis.asyncio as aioredis  # type: ignore[import-untyped]
        from app.platform.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        self._client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            ssl_cert_reqs=None,
        )
        self._ttl = settings.redis_conference_ttl_seconds

    def _key(self, conf_id: str) -> str:
        return f"conf:{conf_id}:state"

    def _participants_key(self, conf_id: str) -> str:
        return f"conf:{conf_id}:participants"

    async def save(self, conf_id: str, state: ConferenceCallState) -> None:
        key = self._key(conf_id)
        await self._client.set(key, state.model_dump_json(by_alias=True))
        await self._client.expire(key, self._ttl)

    async def load(self, conf_id: str) -> ConferenceCallState | None:
        data = await self._client.get(self._key(conf_id))
        if data is None:
            return None
        return ConferenceCallState(**json.loads(data))

    async def save_participant(self, conf_id: str, info: VonageParticipantInfo) -> None:
        key = self._participants_key(conf_id)
        await self._client.hset(key, info.phone_number, info.model_dump_json())
        await self._client.expire(key, self._ttl)

    async def get_participant(self, conf_id: str, phone_number: str) -> VonageParticipantInfo | None:
        data = await self._client.hget(self._participants_key(conf_id), phone_number)
        if data is None:
            return None
        return VonageParticipantInfo(**json.loads(data))

    async def get_participant_by_leg_id(self, conf_id: str, call_leg_id: str) -> VonageParticipantInfo | None:
        all_data = await self._client.hgetall(self._participants_key(conf_id))
        for raw in all_data.values():
            info = VonageParticipantInfo(**json.loads(raw))
            if info.call_leg_id == call_leg_id:
                return info
        return None

    async def get_all_participants(self, conf_id: str) -> dict[str, VonageParticipantInfo]:
        all_data = await self._client.hgetall(self._participants_key(conf_id))
        return {k: VonageParticipantInfo(**json.loads(v)) for k, v in all_data.items()}

    async def delete_participant(self, conf_id: str, phone_number: str) -> None:
        await self._client.hdel(self._participants_key(conf_id), phone_number)

    async def delete(self, conf_id: str) -> None:
        await self._client.delete(self._key(conf_id), self._participants_key(conf_id))

    async def list_active(self) -> list[str]:
        keys = await self._client.keys("conf:*:state")
        return [k.split(":")[1] for k in keys]

    async def close(self) -> None:
        await self._client.aclose()
