import json
import redis.asyncio as aioredis
from app.models.conference_call_state import ConferenceCallState
from app.services.communication_api.vonage_api import VonageParticipantInfo
from app.conf_logger import logger_instance
from config import get_settings


class RedisConferenceStore:
    def __init__(self):
        settings = get_settings()
        self._client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        self._ttl = settings.REDIS_CONFERENCE_TTL_SECONDS

    def _key(self, conf_id: str) -> str:
        return f"conf:{conf_id}:state"

    def _participants_key(self, conf_id: str) -> str:
        return f"conf:{conf_id}:participants"

    async def save(self, conf_id: str, state: ConferenceCallState) -> None:
        try:
            key = self._key(conf_id)
            await self._client.set(key, state.model_dump_json(by_alias=True))
            await self._client.expire(key, self._ttl)
        except Exception as e:
            logger_instance.error(f"Redis save failed for {conf_id}: {e}")

    async def load(self, conf_id: str) -> ConferenceCallState | None:
        try:
            data = await self._client.get(self._key(conf_id))
            if data is None:
                return None
            return ConferenceCallState(**json.loads(data))
        except Exception as e:
            logger_instance.error(f"Redis load failed for {conf_id}: {e}")
            return None

    async def save_participant(self, conf_id: str, info: VonageParticipantInfo) -> None:
        try:
            key = self._participants_key(conf_id)
            await self._client.hset(key, info.phone_number, info.model_dump_json())
            await self._client.expire(key, self._ttl)
        except Exception as e:
            logger_instance.error(f"Redis save_participant failed for {conf_id}: {e}")

    async def get_participant(self, conf_id: str, phone_number: str) -> VonageParticipantInfo | None:
        try:
            data = await self._client.hget(self._participants_key(conf_id), phone_number)
            if data is None:
                return None
            return VonageParticipantInfo(**json.loads(data))
        except Exception as e:
            logger_instance.error(f"Redis get_participant failed for {conf_id}: {e}")
            return None

    async def get_participant_by_leg_id(self, conf_id: str, call_leg_id: str) -> VonageParticipantInfo | None:
        try:
            all_data = await self._client.hgetall(self._participants_key(conf_id))
            for raw in all_data.values():
                info = VonageParticipantInfo(**json.loads(raw))
                if info.call_leg_id == call_leg_id:
                    return info
            return None
        except Exception as e:
            logger_instance.error(f"Redis get_participant_by_leg_id failed for {conf_id}: {e}")
            return None

    async def get_all_participants(self, conf_id: str) -> dict[str, VonageParticipantInfo]:
        try:
            all_data = await self._client.hgetall(self._participants_key(conf_id))
            return {k: VonageParticipantInfo(**json.loads(v)) for k, v in all_data.items()}
        except Exception as e:
            logger_instance.error(f"Redis get_all_participants failed for {conf_id}: {e}")
            return {}

    async def delete_participant(self, conf_id: str, phone_number: str) -> None:
        try:
            await self._client.hdel(self._participants_key(conf_id), phone_number)
        except Exception as e:
            logger_instance.error(f"Redis delete_participant failed for {conf_id}: {e}")

    async def delete(self, conf_id: str) -> None:
        try:
            await self._client.delete(self._key(conf_id), self._participants_key(conf_id))
        except Exception as e:
            logger_instance.error(f"Redis delete failed for {conf_id}: {e}")

    async def list_active(self) -> list[str]:
        try:
            keys = await self._client.keys("conf:*:state")
            return [k.split(":")[1] for k in keys]
        except Exception as e:
            logger_instance.error(f"Redis list_active failed: {e}")
            return []

    async def close(self) -> None:
        await self._client.aclose()
