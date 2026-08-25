"""IVR orchestration — call start, DTMF handling, lifecycle events, and FSM caching."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.ivr_state import IVRCallStateMongoDoc, IVRCallStatus, IVRfsmDoc
from app.providers.vonage_actions.connect_action import VonageConnectAction
from app.providers.vonage_actions.input_action import InputAction
from app.providers.vonage_actions.talk_action import TalkAction
from app.services import ivr_service
from app.services.ivr_service import IVRService
from tests.support.mongomock_async import AsyncMongoMockClient

CALL_ID = "conv-uuid-1"
PHONE = "+911111111111"
TENANT = "tenant-1"
FSM_ID = "fsm-1"
_real_sleep = asyncio.sleep


async def _no_backoff(*_args) -> None:
    await _real_sleep(0)


class FakeFSM:
    """Minimal stand-in for the FSM engine: a fixed transition and serialisable shape."""

    def __init__(self, next_actions=None, next_state_id="state-2"):
        self.fsm_id = FSM_ID
        self.init_state_id = "state-1"
        self.states = {}
        self._next_actions = next_actions if next_actions is not None else []
        self._next_state_id = next_state_id
        self.transitions_seen: list[str] = []

    def get_start_fsm_actions(self):
        return [TalkAction(text="welcome")]

    async def get_next_actions(self, digit, ivr_state):
        self.transitions_seen.append(digit)
        return self._next_actions, self._next_state_id

    def serialize(self):
        return IVRfsmDoc(
            _id=self.fsm_id, created_at=1, states=[{"id": "state-1"}], transitions=[],
            init_state_id=self.init_state_id,
        )


def _streaming_state():
    return SimpleNamespace(actions=[VonageConnectAction(websocket_uri="wss://ws.test/s")], menu=None)


def _settings(**overrides):
    base = {
        "ivr_daily_listening_limit_seconds": 0,
        "default_welcome_language": "en",
        "base_url": "https://api.test",
        "vonage_ivr_application_id": "app-1",
        "vonage_ivr_application_private_key64": "",
        "vonage_number": "+910000000000",
    }
    return SimpleNamespace(**{**base, **overrides})


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_ivr_deep"]


@pytest.fixture
def service(db):
    return IVRService(db)


@pytest.fixture(autouse=True)
def fsm_cache(monkeypatch):
    """The FSM cache is module-level state — give every test its own."""
    monkeypatch.setattr(ivr_service, "_fsm_cache", {})
    monkeypatch.setattr(ivr_service, "_latest_fsm_id", None)
    monkeypatch.setattr(ivr_service, "get_settings", _settings)
    return ivr_service._fsm_cache


@pytest.fixture(autouse=True)
def no_retry_backoff(monkeypatch):
    """The retry loops sleep for whole seconds; nothing under test needs real time to pass.

    `ivr_service.asyncio` is the asyncio module itself, so this replaces sleep everywhere
    for the duration of the test — yield instead of returning immediately, or anything else
    sharing the loop stops being scheduled.
    """
    monkeypatch.setattr(ivr_service.asyncio, "sleep", _no_backoff)


@pytest.fixture
def cached_fsm(monkeypatch, fsm_cache):
    fsm = FakeFSM()
    fsm_cache[FSM_ID] = fsm
    monkeypatch.setattr(ivr_service, "_latest_fsm_id", FSM_ID)
    return fsm


@pytest.fixture
def vonage_call(monkeypatch):
    call = AsyncMock(return_value={"conversation_uuid": CALL_ID})
    monkeypatch.setattr(ivr_service, "_make_vonage_call", call)
    return call


@pytest.fixture
def websocket(monkeypatch):
    ws = MagicMock()
    ws.set_playback_speed = AsyncMock()
    ws.pause_audio = AsyncMock()
    ws.resume_audio = AsyncMock()
    monkeypatch.setattr(ivr_service, "get_websocket_service", AsyncMock(return_value=ws))
    return ws


async def _seed_ongoing(db, **overrides):
    state = IVRCallStateMongoDoc(
        _id=CALL_ID, phone_number=PHONE, fsm_id=FSM_ID, current_state_id="state-1",
        tenant_id=TENANT, **{"created_at": datetime.now(), **overrides},
    )
    await db["ongoingIVRState"].insert_one(state.model_dump(by_alias=True))
    return state


class TestStartCallFlow:
    @pytest.mark.asyncio
    async def test_a_successful_start_persists_the_call_state(
        self, service, db, cached_fsm, vonage_call
    ) -> None:
        result = await service.start_call_flow(PHONE, TENANT)

        assert result == {"status_code": 200, "message": f"IVR started for {PHONE}"}
        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["phone_number"] == PHONE
        assert doc["fsm_id"] == FSM_ID
        assert doc["current_state_id"] == cached_fsm.init_state_id
        assert doc["tenant_id"] == TENANT

    @pytest.mark.asyncio
    async def test_the_start_ncco_comes_from_the_fsm(
        self, service, cached_fsm, vonage_call
    ) -> None:
        await service.start_call_flow(PHONE, TENANT)
        ncco = vonage_call.await_args.args[1]
        assert [a["action"] for a in ncco] == ["talk"]
        assert ncco[0]["text"] == "welcome"

    @pytest.mark.asyncio
    async def test_a_recent_call_in_progress_is_rejected(
        self, service, db, cached_fsm, vonage_call
    ) -> None:
        await _seed_ongoing(db)
        result = await service.start_call_flow(PHONE, TENANT)

        assert result["status_code"] == 400
        assert PHONE in result["message"]
        vonage_call.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_a_stale_call_in_progress_is_cleared_and_the_new_call_starts(
        self, service, db, cached_fsm, vonage_call, monkeypatch
    ) -> None:
        monkeypatch.setenv("STALE_WAIT_IN_MINUTES", "30")
        await _seed_ongoing(db, created_at=datetime.now() - timedelta(hours=2))

        result = await service.start_call_flow(PHONE, TENANT)

        assert result["status_code"] == 200
        vonage_call.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_a_caller_over_the_daily_limit_only_hears_the_limit_announcement(
        self, service, db, cached_fsm, vonage_call, monkeypatch
    ) -> None:
        monkeypatch.setattr(
            ivr_service, "get_settings", lambda: _settings(ivr_daily_listening_limit_seconds=600)
        )
        monkeypatch.setattr(ivr_service, "get_ist_date_string", lambda: "2026-08-25")
        await db["dailyListeningUsage"].insert_one(
            {"phone_number": PHONE, "date": "2026-08-25", "total_seconds": 900}
        )

        result = await service.start_call_flow(PHONE, TENANT)

        assert result["status_code"] == 200
        assert "Daily limit reached" in result["message"]
        assert vonage_call.await_args.args[1][-1] == {"action": "hangup"}
        assert await db["ongoingIVRState"].find_one({"_id": CALL_ID}) is None

    @pytest.mark.asyncio
    async def test_a_caller_under_the_daily_limit_starts_normally(
        self, service, db, cached_fsm, vonage_call, monkeypatch
    ) -> None:
        monkeypatch.setattr(
            ivr_service, "get_settings", lambda: _settings(ivr_daily_listening_limit_seconds=600)
        )
        monkeypatch.setattr(ivr_service, "get_ist_date_string", lambda: "2026-08-25")
        await db["dailyListeningUsage"].insert_one(
            {"phone_number": PHONE, "date": "2026-08-25", "total_seconds": 60}
        )

        assert (await service.start_call_flow(PHONE, TENANT))["status_code"] == 200

    @pytest.mark.asyncio
    async def test_no_usable_fsm_is_a_500(self, service, monkeypatch, vonage_call) -> None:
        monkeypatch.setattr(IVRService, "_ensure_fsm_loaded", AsyncMock(return_value=None))
        result = await service.start_call_flow(PHONE, TENANT)

        assert result == {"status_code": 500, "message": "FSM not available"}
        vonage_call.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_a_vonage_failure_is_reported_not_swallowed(
        self, service, db, cached_fsm, monkeypatch
    ) -> None:
        monkeypatch.setattr(
            ivr_service, "_make_vonage_call", AsyncMock(side_effect=RuntimeError("vonage down"))
        )
        result = await service.start_call_flow(PHONE, TENANT)

        assert result["status_code"] == 500
        assert "vonage down" in result["message"]
        assert await db["ongoingIVRState"].find_one({"phone_number": PHONE}) is None

    @pytest.mark.asyncio
    async def test_an_empty_vonage_response_is_a_500(
        self, service, cached_fsm, monkeypatch
    ) -> None:
        monkeypatch.setattr(ivr_service, "_make_vonage_call", AsyncMock(return_value=None))
        assert await service.start_call_flow(PHONE, TENANT) == {
            "status_code": 500, "message": "No Vonage response",
        }


class TestProcessDtmf:
    @pytest.mark.asyncio
    async def test_an_unknown_call_gets_an_apology_and_a_hangup(self, service) -> None:
        ncco = await service.process_dtmf(CALL_ID, "1")

        assert ncco[0]["action"] == "talk"
        assert "Server error" in ncco[0]["text"]
        assert ncco[-1] == {"action": "hangup"}

    @pytest.mark.asyncio
    async def test_a_call_whose_fsm_left_the_cache_gets_no_ncco(self, service, db) -> None:
        await _seed_ongoing(db)
        assert await service.process_dtmf(CALL_ID, "1") == []

    @pytest.mark.asyncio
    async def test_a_keypress_walks_the_fsm_and_records_the_transition(
        self, service, db, cached_fsm
    ) -> None:
        await _seed_ongoing(db)
        await service.process_dtmf(CALL_ID, "3")

        assert cached_fsm.transitions_seen == ["3"]
        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["current_state_id"] == "state-2"
        assert [a["key_pressed"] for a in doc["user_actions"]] == ["3"]

    @pytest.mark.asyncio
    async def test_multiple_digits_are_walked_one_transition_at_a_time(
        self, service, db, cached_fsm
    ) -> None:
        await _seed_ongoing(db)
        await service.process_dtmf(CALL_ID, "12")

        assert cached_fsm.transitions_seen == ["1", "2"]
        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert [a["key_pressed"] for a in doc["user_actions"]] == ["1", "2"]

    @pytest.mark.asyncio
    async def test_no_keypress_is_recorded_as_an_empty_action(
        self, service, db, cached_fsm
    ) -> None:
        await _seed_ongoing(db)
        await service.process_dtmf(CALL_ID, "")

        assert cached_fsm.transitions_seen == [""]
        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert [a["key_pressed"] for a in doc["user_actions"]] == ["empty"]

    @pytest.mark.asyncio
    async def test_a_state_still_expecting_input_does_not_hang_up(
        self, service, db, fsm_cache, monkeypatch
    ) -> None:
        fsm_cache[FSM_ID] = FakeFSM(
            next_actions=[TalkAction(text="menu"), InputAction(type_=["dtmf"], eventApi="/input")]
        )
        await _seed_ongoing(db)

        ncco = await service.process_dtmf(CALL_ID, "1")
        assert [a["action"] for a in ncco] == ["talk", "input"]

    @pytest.mark.asyncio
    async def test_a_terminal_state_hangs_up(self, service, db, fsm_cache) -> None:
        fsm_cache[FSM_ID] = FakeFSM(next_actions=[TalkAction(text="goodbye")])
        await _seed_ongoing(db)

        ncco = await service.process_dtmf(CALL_ID, "1")
        assert [a["action"] for a in ncco] == ["talk", "hangup"]


class TestProcessDtmfDuringStreaming:
    @pytest.fixture
    def streaming_fsm(self, fsm_cache):
        fsm = FakeFSM()
        fsm.states = {"state-1": _streaming_state()}
        fsm_cache[FSM_ID] = fsm
        return fsm

    @pytest.mark.asyncio
    async def test_a_timeout_keeps_the_dtmf_listener_alive(
        self, service, db, streaming_fsm
    ) -> None:
        await _seed_ongoing(db)
        ncco = await service.process_dtmf(CALL_ID, "", timed_out=True)

        assert [a["action"] for a in ncco] == ["input"]
        assert ncco[0]["eventUrl"] == ["https://api.test/input"]
        assert streaming_fsm.transitions_seen == []

    @pytest.mark.asyncio
    async def test_hash_speeds_playback_up_and_remembers_it(
        self, service, db, streaming_fsm, websocket
    ) -> None:
        await _seed_ongoing(db)
        ncco = await service.process_dtmf(CALL_ID, "#")

        websocket.set_playback_speed.assert_awaited_once_with(CALL_ID, 1.25)
        assert [a["action"] for a in ncco] == ["input"]
        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["experience_data"]["playback_speed"] == 1.25

    @pytest.mark.asyncio
    async def test_star_slows_playback_down_from_the_remembered_speed(
        self, service, db, streaming_fsm, websocket
    ) -> None:
        await _seed_ongoing(db, experience_data={"playback_speed": 1.5})
        await service.process_dtmf(CALL_ID, "*")

        websocket.set_playback_speed.assert_awaited_once_with(CALL_ID, 1.25)
        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["experience_data"]["playback_speed"] == 1.25

    @pytest.mark.asyncio
    async def test_a_websocket_failure_leaves_the_speed_unchanged(
        self, service, db, streaming_fsm, websocket
    ) -> None:
        websocket.set_playback_speed.side_effect = RuntimeError("ws gone")
        await _seed_ongoing(db, experience_data={"playback_speed": 1.5})

        ncco = await service.process_dtmf(CALL_ID, "#")

        assert [a["action"] for a in ncco] == ["input"]
        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["experience_data"]["playback_speed"] == 1.5

    @pytest.mark.asyncio
    async def test_zero_pauses_playback_and_announces_it(
        self, service, db, streaming_fsm, websocket
    ) -> None:
        await _seed_ongoing(db)
        ncco = await service.process_dtmf(CALL_ID, "0")

        websocket.pause_audio.assert_awaited_once_with(CALL_ID)
        assert [a["action"] for a in ncco] == ["talk", "input"]
        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["experience_data"]["is_paused"] is True

    @pytest.mark.asyncio
    async def test_zero_again_resumes_playback(
        self, service, db, streaming_fsm, websocket
    ) -> None:
        await _seed_ongoing(db, experience_data={"is_paused": True})
        ncco = await service.process_dtmf(CALL_ID, "0")

        websocket.resume_audio.assert_awaited_once_with(CALL_ID)
        assert ncco[0]["action"] == "talk"
        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["experience_data"]["is_paused"] is False

    @pytest.mark.asyncio
    async def test_the_pause_announcement_follows_the_menu_language(
        self, service, db, streaming_fsm, websocket
    ) -> None:
        streaming_fsm.states["state-1"] = SimpleNamespace(
            actions=[VonageConnectAction(websocket_uri="wss://ws.test/s")],
            menu=SimpleNamespace(language="hi"),
        )
        await _seed_ongoing(db)

        ncco = await service.process_dtmf(CALL_ID, "0")
        assert ncco[0]["language"] == "hi-IN"

    @pytest.mark.asyncio
    async def test_a_failed_pause_is_not_recorded_as_paused(
        self, service, db, streaming_fsm, websocket
    ) -> None:
        websocket.pause_audio.side_effect = RuntimeError("ws gone")
        await _seed_ongoing(db)

        ncco = await service.process_dtmf(CALL_ID, "0")

        assert [a["action"] for a in ncco] == ["input"]
        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["experience_data"] == {}

    @pytest.mark.asyncio
    async def test_speed_keys_outside_streaming_fall_through_to_the_fsm(
        self, service, db, cached_fsm, websocket
    ) -> None:
        await _seed_ongoing(db)
        await service.process_dtmf(CALL_ID, "#")

        websocket.set_playback_speed.assert_not_awaited()
        assert cached_fsm.transitions_seen == ["#"]


class TestProcessCallEvent:
    @pytest.mark.asyncio
    async def test_an_unknown_call_is_ignored(self, service, db) -> None:
        assert await service.process_call_event(CALL_ID, {"status": "completed"}) is None

    @pytest.mark.asyncio
    async def test_an_end_status_archives_the_call_and_clears_the_live_state(
        self, service, db, monkeypatch
    ) -> None:
        monkeypatch.setattr(ivr_service, "WebsocketClientProvider", MagicMock())
        await _seed_ongoing(db)

        await service.process_call_event(
            CALL_ID, {"status": "completed", "duration": "42", "timestamp": "2026-08-25T10:00:00Z"}
        )

        assert await db["ongoingIVRState"].find_one({"_id": CALL_ID}) is None
        archived = await db["ivrv2logs"].find_one({"_id": CALL_ID})
        assert archived["duration"] == "42"
        assert archived["stopped_at"] is not None
        assert "2026-08-25T10:00:00+00:00" in archived["call_status_updates"]

    @pytest.mark.asyncio
    async def test_a_websocket_close_failure_does_not_block_archiving(
        self, service, db, monkeypatch
    ) -> None:
        provider = MagicMock()
        provider.return_value.close = AsyncMock(side_effect=RuntimeError("ws gone"))
        monkeypatch.setattr(ivr_service, "WebsocketClientProvider", provider)
        await _seed_ongoing(db)

        await service.process_call_event(CALL_ID, {"status": "completed"})

        assert await db["ivrv2logs"].find_one({"_id": CALL_ID}) is not None

    @pytest.mark.asyncio
    async def test_a_mid_call_status_updates_without_archiving(self, service, db) -> None:
        await _seed_ongoing(db)

        await service.process_call_event(
            CALL_ID, {"status": "answered", "timestamp": "2026-08-25T10:00:00Z"}
        )

        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["current_state_id"] == "state-1"
        assert await db["ivrv2logs"].find_one({"_id": CALL_ID}) is None

    @pytest.mark.asyncio
    async def test_an_unrecognised_status_leaves_the_call_alone(self, service, db) -> None:
        await _seed_ongoing(db)
        await service.process_call_event(CALL_ID, {"status": "sideways"})

        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["stopped_at"] is None

    @pytest.mark.asyncio
    async def test_an_unparseable_timestamp_is_dropped_not_fatal(self, service, db) -> None:
        await _seed_ongoing(db)
        await service.process_call_event(
            CALL_ID, {"status": "answered", "timestamp": "not-a-timestamp"}
        )

        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["call_status_updates"] == {}
        assert doc["current_state_id"] == "state-1"
        assert doc["stopped_at"] is None

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", [s.value for s in IVRCallStatus.end_statuses()])
    async def test_every_end_status_archives(self, service, db, monkeypatch, status) -> None:
        monkeypatch.setattr(ivr_service, "WebsocketClientProvider", MagicMock())
        await _seed_ongoing(db)

        await service.process_call_event(CALL_ID, {"status": status})
        assert await db["ongoingIVRState"].find_one({"_id": CALL_ID}) is None


class TestProcessRtcEvent:
    @pytest.mark.asyncio
    async def test_an_audio_play_event_records_the_stream(self, service, db) -> None:
        await _seed_ongoing(db)
        await service.process_rtc_event({
            "type": "audio:play",
            "conversation_id": CALL_ID,
            "timestamp": "2026-08-25T10:00:00Z",
            "body": {"play_id": "p1", "stream_url": ["https://cdn/a.mp3"]},
        })

        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["stream_playback"] == [
            {"play_id": "p1", "stream_url": "https://cdn/a.mp3",
             "started_at": "2026-08-25T10:00:00Z"}
        ]

    @pytest.mark.asyncio
    async def test_a_bare_stream_url_is_stored_as_is(self, service, db) -> None:
        await _seed_ongoing(db)
        await service.process_rtc_event({
            "type": "audio:play",
            "conversation_id": CALL_ID,
            "timestamp": "2026-08-25T10:00:00Z",
            "body": {"play_id": "p1", "stream_url": "https://cdn/a.mp3"},
        })

        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["stream_playback"][0]["stream_url"] == "https://cdn/a.mp3"

    @pytest.mark.asyncio
    async def test_an_audio_play_event_for_an_unknown_call_is_dropped(self, service, db) -> None:
        await service.process_rtc_event({
            "type": "audio:play",
            "conversation_id": "no-such-call",
            "body": {"play_id": "p1", "stream_url": "https://cdn/a.mp3"},
        })
        assert await db["ongoingIVRState"].find_one({"_id": "no-such-call"}) is None

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("event_type", "field"),
        [("audio:play:stop", "stopped_at"), ("audio:play:done", "done_at")],
    )
    async def test_a_stop_or_done_event_closes_out_the_stream(
        self, service, db, event_type, field
    ) -> None:
        await _seed_ongoing(db, stream_playback=[{
            "play_id": "p1", "stream_url": "https://cdn/a.mp3", "started_at": datetime.now(),
        }])

        await service.process_rtc_event({
            "type": event_type,
            "conversation_id": CALL_ID,
            "timestamp": "2026-08-25T10:05:00Z",
            "body": {"play_id": "p1"},
        })

        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["stream_playback"][0][field] == "2026-08-25T10:05:00Z"

    @pytest.mark.asyncio
    async def test_an_unrelated_rtc_event_changes_nothing(self, service, db) -> None:
        await _seed_ongoing(db)
        await service.process_rtc_event({"type": "member:joined", "body": {}})

        doc = await db["ongoingIVRState"].find_one({"_id": CALL_ID})
        assert doc["stream_playback"] == []


class TestFsmStructure:
    @pytest.mark.asyncio
    async def test_the_structure_is_the_cached_fsm_serialised(self, service, cached_fsm) -> None:
        assert await service.get_ivr_structure(TENANT) == {
            "fsm_id": FSM_ID,
            "init_state_id": "state-1",
            "states": [{"id": "state-1"}],
            "transitions": [],
            "created_at": 1,
        }

    @pytest.mark.asyncio
    async def test_no_fsm_anywhere_is_reported_as_an_error(
        self, service, monkeypatch
    ) -> None:
        monkeypatch.setattr(
            ivr_service, "instantiate_from_latest_content",
            AsyncMock(side_effect=RuntimeError("no content")),
        )
        assert await service.get_ivr_structure(TENANT) == {
            "error": "No FSM available", "states": [], "transitions": [],
        }

    @pytest.mark.asyncio
    async def test_an_update_is_refused_while_calls_are_live(
        self, service, db, cached_fsm
    ) -> None:
        await _seed_ongoing(db)
        result = await service.update_ivr_structure(TENANT, {})

        assert result["status_code"] == 409
        assert "1 active call" in result["message"]

    @pytest.mark.asyncio
    async def test_an_update_rebuilds_persists_and_caches_the_fsm(
        self, service, db, fsm_cache, monkeypatch
    ) -> None:
        rebuilt = FakeFSM()
        monkeypatch.setattr(
            ivr_service, "instantiate_from_latest_content", AsyncMock(return_value=rebuilt)
        )

        result = await service.update_ivr_structure(TENANT, {})

        assert result == {
            "status_code": 200, "message": "FSM updated successfully", "fsm_id": FSM_ID,
        }
        assert fsm_cache[FSM_ID] is rebuilt
        assert ivr_service._latest_fsm_id == FSM_ID
        assert await db["ivrfsms"].find_one({"_id": FSM_ID}) is not None


class TestEnsureFsmLoaded:
    @pytest.mark.asyncio
    async def test_a_persisted_fsm_is_deserialised_into_the_cache(
        self, service, db, fsm_cache, monkeypatch
    ) -> None:
        await db["ivrfsms"].insert_one(
            {"_id": FSM_ID, "created_at": 1, "states": [], "transitions": [],
             "init_state_id": "state-1"}
        )
        loaded = FakeFSM()
        monkeypatch.setattr(ivr_service, "instantitate_from_doc", MagicMock(return_value=loaded))

        await service._ensure_fsm_loaded()

        assert fsm_cache[FSM_ID] is loaded
        assert ivr_service._latest_fsm_id == FSM_ID

    @pytest.mark.asyncio
    async def test_an_undeserialisable_persisted_fsm_falls_back_to_a_rebuild(
        self, service, db, fsm_cache, monkeypatch
    ) -> None:
        await db["ivrfsms"].insert_one(
            {"_id": "stale-fsm", "created_at": 1, "states": [], "transitions": [],
             "init_state_id": "state-1"}
        )
        monkeypatch.setattr(
            ivr_service, "instantitate_from_doc", MagicMock(side_effect=RuntimeError("bad shape"))
        )
        rebuilt = FakeFSM()
        monkeypatch.setattr(
            ivr_service, "instantiate_from_latest_content", AsyncMock(return_value=rebuilt)
        )

        await service._ensure_fsm_loaded()
        assert fsm_cache[FSM_ID] is rebuilt

    @pytest.mark.asyncio
    async def test_a_failed_rebuild_leaves_the_cache_empty(
        self, service, fsm_cache, monkeypatch
    ) -> None:
        monkeypatch.setattr(
            ivr_service, "instantiate_from_latest_content",
            AsyncMock(side_effect=RuntimeError("no content")),
        )

        await service._ensure_fsm_loaded()

        assert fsm_cache == {}
        assert ivr_service._latest_fsm_id is None

    @pytest.mark.asyncio
    async def test_an_already_cached_fsm_is_not_reloaded(
        self, service, cached_fsm, monkeypatch
    ) -> None:
        rebuild = AsyncMock()
        monkeypatch.setattr(ivr_service, "instantiate_from_latest_content", rebuild)

        await service._ensure_fsm_loaded()
        rebuild.assert_not_awaited()


class TestFsmLookup:
    @pytest.mark.asyncio
    async def test_an_fsm_is_found_in_the_radio_collection_too(self, service, db) -> None:
        await db["radioFSMs"].insert_one(
            {"_id": "radio-1", "created_at": 1, "states": [], "transitions": [],
             "init_state_id": "s1"}
        )
        assert (await service.get_ivr_fsm_by_id("radio-1")).init_state_id == "s1"

    @pytest.mark.asyncio
    async def test_an_unknown_fsm_id_is_none(self, service) -> None:
        assert await service.get_ivr_fsm_by_id("nope") is None
