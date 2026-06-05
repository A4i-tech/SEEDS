# services/conference_call_manager.py
import asyncio
from datetime import datetime
from typing import Dict, List
import uuid
import os

from dotenv import load_dotenv
from app.services.communication_api import CommunicationAPIFactory, CommunicationAPIType
from app.services.storage_manager import StorageManager, create_storage_manager
from app.services.smartphone_connection_manager import SmartphoneConnectionManagerType, SmartphoneConnectionManagerFactory
from app.services.conference_call import ConferenceCall
from app.services.redis_conference_store import RedisConferenceStore
from app.models.action_history import ActionHistory, ActionType
from app.conf_logger import logger_instance
from config import get_settings

load_dotenv()

class ConferenceCallManager:
    def __init__(
        self,
        communication_api_type: CommunicationAPIType,
        smartphone_connection_manager_type: SmartphoneConnectionManagerType,
        storage_manager: StorageManager,
    ):
        self.communication_api_type = communication_api_type
        self.smartphone_connection_manager_type = smartphone_connection_manager_type
        self.storage_manager = storage_manager
        self.communication_api_factory = CommunicationAPIFactory()
        self.smartphone_connection_manager_factory = SmartphoneConnectionManagerFactory()
        self.conferences: Dict[str, ConferenceCall] = {}
        self.ws_base_url = os.environ.get("WS_SERVER_EP", "")
        self._redis_store: RedisConferenceStore | None = None

    def _get_redis(self) -> RedisConferenceStore:
        if self._redis_store is None:
            self._redis_store = RedisConferenceStore()
        return self._redis_store

    def _attach_redis(self, conference_call: ConferenceCall) -> None:
        store = self._get_redis()
        conference_call.redis_store = store
        conference_call.communication_api.redis_store = store

    def _build_conference_call(self, conf_id: str) -> ConferenceCall:
        conference_call = ConferenceCall(
            conf_id=conf_id,
            communication_api=self.communication_api_factory.create(
                self.communication_api_type,
                conf_id,
                ws_url=f"{self.ws_base_url}?id={conf_id}",
            ),
            connection_manager=self.smartphone_connection_manager_factory.create(
                self.smartphone_connection_manager_type, conf_id
            ),
            storage_manager=self.storage_manager,
        )
        self._attach_redis(conference_call)
        return conference_call

    async def create_conference(self, teacher_phone: str, student_phones: List[str], leader_phone: str = None, teacher_name: str | None = None, student_names: List[str] | None = None) -> ConferenceCall:
        conf_id = str(uuid.uuid4())
        conference_call = self._build_conference_call(conf_id)
        conference_call.set_participant_state(teacher_phone, student_phones, leader_phone, teacher_name=teacher_name, student_names=student_names)
        conference_call.state.action_history.append(ActionHistory(
            timestamp=datetime.now().isoformat(),
            action_type=ActionType.CONFERENCE_CREATED,
            metadata={
                "teacher_phone": teacher_phone,
                "student_phones": student_phones,
            },
            owner=teacher_phone,
        ))
        self.conferences[conf_id] = conference_call
        await conference_call.update_state()
        return conference_call

    async def start_conference_call(self, conf_id: str) -> None:
        conf: ConferenceCall = self.get_conference(conf_id)
        if not conf:
            raise ValueError(f"No such conference has been created; ID: {conf_id}")

        conf.start_processing_conf_events_from_queue()
        conf.start_remote_audio_relay()

        conf.state.action_history.append(ActionHistory(
            timestamp=datetime.now().isoformat(),
            action_type=ActionType.CONFERENCE_START_REQUESTED,
            metadata={
                "teacher_phone": conf.state.teacher_phone_number,
                "student_phones": [s.phone_number for s in conf.state.get_students()],
            },
            owner=conf.state.teacher_phone_number,
        ))

        try:
            await conf.update_state()
            await conf.start_conference()
        except Exception as original_exc:
            conf.end_processing_conf_events_from_queue()
            conf.stop_remote_audio_relay()
            conf.state.action_history.append(ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.CONFERENCE_START_FAILED,
                metadata={"error": type(original_exc).__name__, "detail": str(original_exc)},
                owner=conf.state.teacher_phone_number,
            ))
            try:
                await conf.update_state()
            except Exception:
                logger_instance.error("Failed to persist CONFERENCE_START_FAILED", exc_info=True)
            raise

    def get_conference(self, conference_id: str) -> ConferenceCall | None:
        return self.conferences.get(conference_id, None)

    def delete_conference(self, conf_id: str) -> None:
        self.conferences.pop(conf_id, None)
        asyncio.create_task(self._get_redis().delete(conf_id))

    def get_conference_from_phone_number(self, phone_number: str) -> ConferenceCall | None:
        for conf in self.conferences.values():
            participant_phone_numbers = conf.state.participants.keys()
            if phone_number in participant_phone_numbers:
                return conf
        return None

    async def restore_from_redis(self) -> None:
        store = self._get_redis()
        conf_ids = await store.list_active()
        for conf_id in conf_ids:
            if conf_id in self.conferences:
                continue
            state = await store.load(conf_id)
            if state is None:
                continue
            conference_call = self._build_conference_call(conf_id)
            conference_call.state = state

            # Rehydrate CommunicationAPI fields derived from state/participants.
            comm_api = conference_call.communication_api
            if hasattr(comm_api, "teacher_phone_number"):
                comm_api.teacher_phone_number = state.teacher_phone_number
            participants = await store.get_all_participants(conf_id)
            conv_id = next((p.conference_conv_id for p in participants.values() if p.conference_conv_id), None)
            if conv_id and hasattr(comm_api, "vonage_conv_id"):
                comm_api.vonage_conv_id = conv_id

            self.conferences[conf_id] = conference_call
            if state.is_running:
                conference_call.start_processing_conf_events_from_queue()
                conference_call.start_remote_audio_relay()
                conference_call.restore_auto_end_timer()
                logger_instance.info(f"Restored running conference {conf_id}")
            else:
                logger_instance.info(f"Restored idle conference {conf_id}")

    async def close(self) -> None:
        if self._redis_store is not None:
            await self._redis_store.close()


# UNIVERSAL ConferenceCallManager instance
conference_manager = ConferenceCallManager(
    communication_api_type=CommunicationAPIType.VONAGE,
    smartphone_connection_manager_type=SmartphoneConnectionManagerType.SSE,
    storage_manager=create_storage_manager(),
)
