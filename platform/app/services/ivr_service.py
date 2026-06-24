"""IVR orchestration service — high-level interface wrapping the FSM engine.

Provides the five core IVR operations consumed by controllers and consumers:

  start_call_flow       — begin a new IVR call (returns NCCO)
  process_dtmf          — handle a DTMF keypress (returns NCCO)
  process_call_event    — process a Vonage call lifecycle event
  get_ivr_structure     — retrieve the active FSM document
  update_ivr_structure  — rebuild and persist the FSM from latest content
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
from datetime import datetime
from typing import Any

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.dependencies import get_db

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers — action factory / accumulator
# ---------------------------------------------------------------------------

def _get_factory_and_accumulator():
    from app.providers.vonage_actions.action_factory import VonageActionFactory  # noqa: PLC0415
    factory = VonageActionFactory()
    accumulator = factory.get_action_accumulator_implmentation()
    return factory, accumulator


# ---------------------------------------------------------------------------
# FSM singleton cache  (fsm_id -> FSM instance)
# Module-level globals preserve the cache across per-request service instances.
# ---------------------------------------------------------------------------

_fsm_cache: dict[str, Any] = {}
_latest_fsm_id: str | None = None


def get_fsm_cache() -> dict[str, Any]:
    return _fsm_cache


def get_latest_fsm_id() -> str | None:
    return _latest_fsm_id


def set_latest_fsm_id(fsm_id: str) -> None:
    global _latest_fsm_id
    _latest_fsm_id = fsm_id


# ---------------------------------------------------------------------------
# Internal: Vonage call creation (no db dependency — standalone helper)
# ---------------------------------------------------------------------------

async def _make_vonage_call(
    phone_number: str,
    ncco_actions: list[dict],
    settings: Any,
) -> dict[str, Any] | None:
    import vonage  # noqa: PLC0415

    raw_key = base64.b64decode(settings.vonage_application_private_key64).decode("utf-8")
    # Use conference app credentials — IVR is merged into same platform/app
    client = vonage.Client(
        application_id=settings.vonage_conference_application_id,
        private_key=raw_key,
    )
    vonage_number = getattr(settings, "vonage_number", "") or os.getenv("VONAGE_NUMBER", "")
    response = await asyncio.to_thread(
        client.voice.create_call,
        {
            "to": [{"type": "phone", "number": phone_number}],
            "from": {"type": "phone", "number": vonage_number},
            "ncco": ncco_actions,
        },
    )
    return response


# ---------------------------------------------------------------------------
# IVRService
# ---------------------------------------------------------------------------

class IVRService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:  # type: ignore[type-arg]
        self._db = db

    # ------------------------------------------------------------------
    # start_call_flow
    # ------------------------------------------------------------------

    async def start_call_flow(
        self,
        phone_number: str,
        tenant_id: str,
    ) -> dict[str, Any]:
        """Start an IVR call to *phone_number*.

        Performs daily-limit check, creates Vonage call, persists IVR state.

        Returns:
            {"status_code": 200, "message": "..."} on success
            {"status_code": 4xx/5xx, "message": "..."} on failure
        """
        from app.models.ivr_state import IVRCallStateMongoDoc  # noqa: PLC0415
        from app.platform.settings import get_settings  # noqa: PLC0415

        settings = get_settings()

        # Check for existing ongoing call
        ongoing_col = self._db["ongoingIVRState"]
        existing = await ongoing_col.find_one({"phone_number": phone_number})
        if existing:
            existing_state = IVRCallStateMongoDoc.from_mongo(existing)
            stale_minutes = int(os.environ.get("STALE_WAIT_IN_MINUTES", "60"))
            age_minutes = (datetime.now() - existing_state.created_at).total_seconds() / 60
            if age_minutes > stale_minutes:
                await ongoing_col.delete_one({"_id": existing_state.id})
            else:
                return {
                    "status_code": 400,
                    "message": f"IVR already in progress for {phone_number}",
                }

        # Check daily listening limit
        if settings.ivr_daily_listening_limit_seconds > 0:
            from app.services.fsm.utils import get_ist_date_string  # noqa: PLC0415
            today = get_ist_date_string()
            usage_col = self._db["dailyListeningUsage"]
            usage_doc = await usage_col.find_one(
                {"phone_number": phone_number, "date": today}
            )
            current_usage = usage_doc.get("total_seconds", 0) if usage_doc else 0
            if current_usage >= settings.ivr_daily_listening_limit_seconds:
                logger.info("Daily limit reached for %s", phone_number)
                from app.providers.vonage_actions.talk_action import TalkAction  # noqa: PLC0415
                from app.services.fsm.utils import (  # noqa: PLC0415
                    get_daily_limit_announcement,
                    get_vonage_language_code,
                )
                announcement = get_daily_limit_announcement(settings.default_welcome_language)
                vonage_lang = get_vonage_language_code(settings.default_welcome_language)
                factory, accumulator = _get_factory_and_accumulator()
                limit_ncco = accumulator.combine([
                    factory.get_action_implmentation(
                        TalkAction(
                            text=announcement, level=1.0, bargeIn=False, loop=1,
                            language=vonage_lang,
                        )
                    )
                ])
                limit_ncco.append({"action": "hangup"})
                await _make_vonage_call(phone_number, limit_ncco, settings)
                return {
                    "status_code": 200,
                    "message": f"Daily limit reached for {phone_number}, limit notification sent",
                }

        # Get or build FSM
        if not _latest_fsm_id or _latest_fsm_id not in _fsm_cache:
            await self._ensure_fsm_loaded()

        if not _latest_fsm_id or _latest_fsm_id not in _fsm_cache:
            return {"status_code": 500, "message": "FSM not available"}

        latest_fsm = _fsm_cache[_latest_fsm_id]
        factory, accumulator = _get_factory_and_accumulator()
        ncco_actions = accumulator.combine(
            [factory.get_action_implmentation(x) for x in latest_fsm.get_start_fsm_actions()]
        )

        try:
            vonage_resp = await _make_vonage_call(phone_number, ncco_actions, settings)
        except Exception as exc:
            logger.error("Vonage call creation failed for %s: %s", phone_number, exc)
            return {"status_code": 500, "message": f"Failed to start call: {exc}"}

        if not vonage_resp:
            return {"status_code": 500, "message": "No Vonage response"}

        conv_uuid = vonage_resp.get("conversation_uuid", "")
        ivr_state = IVRCallStateMongoDoc(
            _id=conv_uuid,
            phone_number=phone_number,
            fsm_id=latest_fsm.fsm_id,
            current_state_id=latest_fsm.init_state_id,
            created_at=datetime.now(),
            tenant_id=tenant_id,
        )
        await ongoing_col.replace_one(
            {"_id": conv_uuid}, ivr_state.model_dump(by_alias=True), upsert=True
        )
        logger.info("IVR call started: phone=%s conv_uuid=%s", phone_number, conv_uuid)
        return {"status_code": 200, "message": f"IVR started for {phone_number}"}

    # ------------------------------------------------------------------
    # process_dtmf
    # ------------------------------------------------------------------

    async def process_dtmf(
        self,
        call_id: str,
        dtmf: str,
        timed_out: bool = False,
    ) -> list[Any]:
        """Process a DTMF input for an active IVR call.

        Returns NCCO-compatible list of action dicts, or empty list on error.
        Handles speed control (*/#), pause/resume (0), and WebSocket timeout.
        """
        from app.models.ivr_state import IVRCallStateMongoDoc, UserAction  # noqa: PLC0415
        from app.providers.vonage_actions.connect_action import VonageConnectAction  # noqa: PLC0415
        from app.providers.vonage_actions.input_action import InputAction  # noqa: PLC0415
        from app.providers.vonage_actions.talk_action import TalkAction  # noqa: PLC0415
        from app.platform.settings import get_settings  # noqa: PLC0415

        ongoing_col = self._db["ongoingIVRState"]
        factory, accumulator = _get_factory_and_accumulator()

        # Retry logic for race condition
        doc = None
        for attempt in range(3):
            doc = await ongoing_col.find_one({"_id": call_id})
            if doc:
                break
            if attempt < 2:
                await asyncio.sleep(0.5)

        if doc is None:
            logger.warning("No IVR state for call_id=%s", call_id)
            error_ncco = accumulator.combine([
                factory.get_action_implmentation(
                    TalkAction(text="Server error. Please try again later. Bye bye.")
                )
            ])
            error_ncco.append({"action": "hangup"})
            return error_ncco

        ivr_state = IVRCallStateMongoDoc.from_mongo(doc)

        if ivr_state.fsm_id not in _fsm_cache:
            logger.error("FSM %s not in cache", ivr_state.fsm_id)
            return []

        fsm = _fsm_cache[ivr_state.fsm_id]
        digits = dtmf if dtmf is not None else ""

        # Detect WebSocket streaming state
        current_state = fsm.states.get(ivr_state.current_state_id)
        is_streaming = current_state and any(
            isinstance(a, VonageConnectAction) for a in current_state.actions
        )

        _keep_listening_ncco = [{
            "type": ["dtmf"],
            "action": "input",
            "eventUrl": [get_settings().base_url + "/dtmf"],
            "dtmf": {"maxDigits": 1, "submitOnHash": False, "timeOut": 10},
        }]

        # Timeout during WebSocket playback — keep listening without interrupting
        if digits == "" and timed_out and is_streaming:
            logger.info("DTMF timeout during WebSocket playback for %s — keeping listener", call_id)
            return _keep_listening_ncco

        # Speed control (* = decrease, # = increase) during streaming
        if digits in ("*", "#") and is_streaming:
            from app.services.fsm.instantiation.speed_control import decrease_speed, increase_speed  # noqa: PLC0415
            current_speed = (ivr_state.experience_data or {}).get("playback_speed", 1.0)
            new_speed, _ = increase_speed(current_speed) if digits == "#" else decrease_speed(current_speed)
            try:
                from app.providers.websocket_client import get_websocket_service  # noqa: PLC0415
                ws = await get_websocket_service()
                await ws.set_playback_speed(call_id, new_speed)
                logger.info("Speed changed %s→%s for %s", current_speed, new_speed, call_id)
            except Exception as exc:
                logger.error("Failed to set speed for %s: %s", call_id, exc)
                new_speed = current_speed
            if not ivr_state.experience_data:
                ivr_state.experience_data = {}
            ivr_state.experience_data["playback_speed"] = new_speed
            await ongoing_col.replace_one({"_id": call_id}, ivr_state.model_dump(by_alias=True), upsert=True)
            return _keep_listening_ncco

        # Pause/resume toggle (0) during streaming
        if digits == "0" and is_streaming:
            from app.services.fsm.instantiation.pause_announcement import get_paused_announcement, get_resuming_announcement  # noqa: PLC0415
            from app.services.fsm.utils import get_vonage_language_code  # noqa: PLC0415
            is_paused = (ivr_state.experience_data or {}).get("is_paused", False)
            new_pause = not is_paused
            settings = get_settings()
            language = settings.default_welcome_language
            if current_state and hasattr(current_state, "menu") and current_state.menu and hasattr(current_state.menu, "language"):
                language = current_state.menu.language
            vonage_lang = get_vonage_language_code(language)
            try:
                from app.providers.websocket_client import get_websocket_service  # noqa: PLC0415
                ws = await get_websocket_service()
                if new_pause:
                    await ws.pause_audio(call_id)
                    announcement = get_paused_announcement(language)
                else:
                    await ws.resume_audio(call_id)
                    announcement = get_resuming_announcement(language)
                logger.info("Pause toggled to %s for %s", new_pause, call_id)
            except Exception as exc:
                logger.error("Failed to toggle pause for %s: %s", call_id, exc)
                return _keep_listening_ncco
            if not ivr_state.experience_data:
                ivr_state.experience_data = {}
            ivr_state.experience_data["is_paused"] = new_pause
            await ongoing_col.replace_one({"_id": call_id}, ivr_state.model_dump(by_alias=True), upsert=True)
            return [
                {"action": "talk", "text": announcement, "language": vonage_lang, "level": 1.0, "bargeIn": True},
                *_keep_listening_ncco,
            ]

        # Normal FSM processing
        input_time = datetime.now()
        next_actions: list[Any] | None = None
        next_state_id: str | None = None

        if digits == "":
            pre_state_id = ivr_state.current_state_id
            next_actions, next_state_id = await fsm.get_next_actions("", ivr_state)
            ivr_state.current_state_id = next_state_id
            ivr_state.user_actions.append(
                UserAction(key_pressed="empty", timestamp=input_time, pre_state_id=pre_state_id, post_state_id=next_state_id)
            )
        else:
            for digit in digits:
                pre_state_id = ivr_state.current_state_id
                next_actions, next_state_id = await fsm.get_next_actions(digit, ivr_state)
                ivr_state.current_state_id = next_state_id
                ivr_state.user_actions.append(
                    UserAction(key_pressed=digit if digit != "" else "empty", timestamp=input_time, pre_state_id=pre_state_id, post_state_id=next_state_id)
                )

        await ongoing_col.replace_one(
            {"_id": call_id}, ivr_state.model_dump(by_alias=True), upsert=True
        )

        is_terminal = not any(isinstance(a, InputAction) for a in (next_actions or []))
        ncco = accumulator.combine([factory.get_action_implmentation(x) for x in (next_actions or [])])
        if is_terminal:
            ncco.append({"action": "hangup"})

        return ncco

    # ------------------------------------------------------------------
    # process_call_event
    # ------------------------------------------------------------------

    async def process_call_event(
        self,
        call_id: str,
        event: dict[str, Any],
    ) -> None:
        """Process a Vonage call lifecycle event (answered, completed, etc.)."""
        from app.models.ivr_state import IVRCallStateMongoDoc, IVRCallStatus  # noqa: PLC0415

        ongoing_col = self._db["ongoingIVRState"]
        logs_col = self._db["ivrv2logs"]

        status = event.get("status", "")
        timestamp_str = event.get("timestamp", "")
        duration = event.get("duration")

        # Retry logic
        doc = None
        for attempt in range(5):
            doc = await ongoing_col.find_one({"_id": call_id})
            if doc:
                break
            if attempt < 4:
                await asyncio.sleep(1.0)

        if doc is None:
            logger.info(
                "No IVR state for call_id=%s status=%s — may be external call", call_id, status
            )
            return

        ivr_state = IVRCallStateMongoDoc.from_mongo(doc)

        update_ops: dict[str, Any] = {}
        if timestamp_str:
            try:
                if isinstance(timestamp_str, str):
                    ts = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                else:
                    ts = timestamp_str
                update_ops[f"call_status_updates.{ts.isoformat()}"] = status
            except Exception:
                pass

        try:
            status_enum = IVRCallStatus(status)
            if status_enum in IVRCallStatus.end_statuses():
                update_ops["stopped_at"] = datetime.now()
                update_ops["duration"] = duration

                await ongoing_col.update_one({"_id": call_id}, {"$set": update_ops})
                final_doc = await ongoing_col.find_one({"_id": call_id})
                if final_doc:
                    final_state = IVRCallStateMongoDoc.from_mongo(final_doc)
                    await logs_col.replace_one(
                        {"_id": call_id},
                        final_state.model_dump(by_alias=True),
                        upsert=True,
                    )
                    try:
                        from app.providers.websocket_client import (
                            get_websocket_service,  # noqa: PLC0415
                        )
                        ws = await get_websocket_service()
                        await ws.disconnect(call_id)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("Failed to disconnect WS for %s: %s", call_id, exc)

                await ongoing_col.delete_one({"_id": call_id})
                logger.info("Call ended and archived: %s", call_id)
            else:
                update_ops["current_state_id"] = ivr_state.current_state_id
                await ongoing_col.update_one({"_id": call_id}, {"$set": update_ops})
        except ValueError:
            logger.warning("Unknown call status: %s", status)

    # ------------------------------------------------------------------
    # get_ivr_fsm_by_id
    # ------------------------------------------------------------------

    async def get_ivr_fsm_by_id(self, fsm_id: str) -> Any | None:
        """Return the FSM document for fsm_id, checking ivrfsms then radioFSMs."""
        from app.repositories.ivr_repository import IVRRepository  # noqa: PLC0415
        return await IVRRepository(self._db).find_fsm_by_id_any(fsm_id)

    # ------------------------------------------------------------------
    # get_ivr_structure
    # ------------------------------------------------------------------

    async def get_ivr_structure(self, tenant_id: str) -> dict[str, Any]:
        """Return the active FSM structure document."""
        if not _latest_fsm_id:
            await self._ensure_fsm_loaded()

        if not _latest_fsm_id:
            return {"error": "No FSM available", "states": [], "transitions": []}

        fsm = _fsm_cache.get(_latest_fsm_id)
        if fsm is None:
            return {"error": "FSM not in cache"}

        fsm_doc = fsm.serialize()
        return {
            "fsm_id": fsm_doc.id,
            "init_state_id": fsm_doc.init_state_id,
            "states": fsm_doc.states,
            "transitions": fsm_doc.transitions,
            "created_at": fsm_doc.created_at,
        }

    # ------------------------------------------------------------------
    # update_ivr_structure
    # ------------------------------------------------------------------

    async def update_ivr_structure(
        self,
        tenant_id: str,
        structure: dict[str, Any],
    ) -> dict[str, Any]:
        """Rebuild the FSM from latest MongoDB content and persist it.

        Refuses to update if active calls exist (returns 409-like response).
        """
        global _latest_fsm_id

        ongoing_col = self._db["ongoingIVRState"]
        active_count = await ongoing_col.count_documents({})
        if active_count > 0:
            return {
                "status_code": 409,
                "message": f"Cannot update IVR — {active_count} active call(s). Try again later.",
            }

        from app.services.fsm.instantiation.insti import (
            instantiate_from_latest_content,  # noqa: PLC0415
        )

        updated_fsm = await instantiate_from_latest_content(db=self._db)
        _fsm_cache[updated_fsm.fsm_id] = updated_fsm
        _latest_fsm_id = updated_fsm.fsm_id

        fsm_doc = updated_fsm.serialize()
        fsm_col = self._db["ivrfsms"]
        await fsm_col.replace_one(
            {"_id": fsm_doc.id},
            fsm_doc.model_dump(by_alias=True),
            upsert=True,
        )

        return {
            "status_code": 200,
            "message": "FSM updated successfully",
            "fsm_id": updated_fsm.fsm_id,
        }

    # ------------------------------------------------------------------
    # Internal: ensure FSM is loaded from DB or content
    # ------------------------------------------------------------------

    async def _ensure_fsm_loaded(self) -> None:
        """Load the latest FSM from DB or build from content if not in cache."""
        global _latest_fsm_id

        if _latest_fsm_id and _latest_fsm_id in _fsm_cache:
            return

        fsm_col = self._db["ivrfsms"]

        # Try loading the latest persisted FSM
        cursor = fsm_col.find({}).sort("created_at", -1).limit(1)
        docs = await cursor.to_list(length=1)
        if docs:
            from app.models.ivr_state import IVRfsmDoc  # noqa: PLC0415
            from app.services.fsm.instantiation.insti import instantitate_from_doc  # noqa: PLC0415

            doc = docs[0]
            fsm_doc = IVRfsmDoc.from_mongo(doc)
            try:
                fsm = instantitate_from_doc(fsm_doc)
                _fsm_cache[fsm.fsm_id] = fsm
                _latest_fsm_id = fsm.fsm_id
                logger.info("FSM loaded from DB: %s", _latest_fsm_id)
                return
            except Exception as exc:
                logger.warning("Failed to deserialize persisted FSM: %s", exc)

        # Fall back to building from content
        try:
            from app.services.fsm.instantiation.insti import (
                instantiate_from_latest_content,  # noqa: PLC0415
            )

            fsm = await instantiate_from_latest_content(db=self._db)
            _fsm_cache[fsm.fsm_id] = fsm
            _latest_fsm_id = fsm.fsm_id
            logger.info("FSM built from content: %s", _latest_fsm_id)
        except Exception as exc:
            logger.error("Failed to build FSM from content: %s", exc)


def get_ivr_service(
    db: AsyncIOMotorDatabase[Any] = Depends(get_db),  # type: ignore[type-arg]
) -> IVRService:
    return IVRService(db)
