"""Tests for app.providers.vonage_api.VonageAPIProvider."""

from __future__ import annotations

import base64
import logging
from typing import Any
from unittest.mock import AsyncMock, MagicMock, create_autospec, patch

import pytest
from pytest import LogCaptureFixture
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import ReadTimeout
from vonage.errors import ClientError

from app.providers.vonage_api import VonageAPIProvider, VonageParticipantInfo
from app.services.redis_conference_store import RedisConferenceStore


def _make_redis_store() -> MagicMock:
    store = create_autospec(RedisConferenceStore, instance=True)
    data: dict[str, dict[str, VonageParticipantInfo]] = {}

    async def save_participant(conf_id, info):
        data.setdefault(conf_id, {})[info.phone_number] = info

    async def get_participant(conf_id, phone_number):
        return data.get(conf_id, {}).get(phone_number)

    async def get_all_participants(conf_id):
        return dict(data.get(conf_id, {}))

    async def get_participant_by_leg_id(conf_id, call_leg_id):
        for p in data.get(conf_id, {}).values():
            if p.call_leg_id == call_leg_id:
                return p
        return None

    async def delete_participant(conf_id, phone_number):
        data.get(conf_id, {}).pop(phone_number, None)

    store.save_participant.side_effect = save_participant
    store.get_participant.side_effect = get_participant
    store.get_all_participants.side_effect = get_all_participants
    store.get_participant_by_leg_id.side_effect = get_participant_by_leg_id
    store.delete_participant.side_effect = delete_participant
    return store


_UNSET = object()


def make_provider(
    *,
    application_id: str = "app-id",
    private_key: str = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    vonage_number: str = "15551234567",
    conf_id: str = "conf-1",
    ws_server_url: str = "wss://ws.example.com",
    events_webhook_url: str = "https://events.example.com",
    call_timeout_seconds: float = 5.0,
    redis_store: Any = _UNSET,
) -> VonageAPIProvider:
    with patch("vonage.Client", return_value=MagicMock()):
        provider = VonageAPIProvider(
            application_id=application_id,
            private_key=private_key,
            vonage_number=vonage_number,
            conf_id=conf_id,
            ws_server_url=ws_server_url,
            events_webhook_url=events_webhook_url,
            call_timeout_seconds=call_timeout_seconds,
        )
    provider.redis_store = _make_redis_store() if redis_store is _UNSET else redis_store
    return provider


async def _seed_participant(
    provider: VonageAPIProvider,
    phone_number: str,
    call_leg_id: str = "leg-1",
    initial_conv_id: str = "conv-1",
    conference_conv_id: str | None = None,
) -> VonageParticipantInfo:
    info = VonageParticipantInfo(
        phone_number=phone_number,
        call_leg_id=call_leg_id,
        initial_conv_id=initial_conv_id,
        conference_conv_id=conference_conv_id,
    )
    await provider.redis_store.save_participant(provider.conf_id, info)
    return info


class TestInit:
    def test_init_decodes_base64_private_key(self) -> None:
        raw_key = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
        encoded_key = base64.b64encode(raw_key.encode("utf-8")).decode("utf-8")
        with patch("vonage.Client", return_value=MagicMock()) as mock_client_cls:
            VonageAPIProvider(
                application_id="app-id",
                private_key=encoded_key,
                vonage_number="15551234567",
                conf_id="conf-1",
            )
        kwargs = mock_client_cls.call_args.kwargs
        assert kwargs["private_key"] == raw_key

    def test_init_leaves_pem_private_key_untouched(self) -> None:
        raw_key = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
        with patch("vonage.Client", return_value=MagicMock()) as mock_client_cls:
            VonageAPIProvider(
                application_id="app-id",
                private_key=raw_key,
                vonage_number="15551234567",
                conf_id="conf-1",
            )
        kwargs = mock_client_cls.call_args.kwargs
        assert kwargs["private_key"] == raw_key


class TestCreateCallWithRetry:
    async def test_success_first_attempt(self) -> None:
        provider = make_provider()
        provider._client.voice.create_call = MagicMock(
            return_value={"uuid": "leg-1", "conversation_uuid": "conv-1", "status": "started"}
        )

        await provider.add_participant("123")

        assert provider._client.voice.create_call.call_count == 1
        saved = await provider.redis_store.get_participant("conf-1", "123")
        assert saved.call_leg_id == "leg-1"

    async def test_rate_limited_retries_then_succeeds(self, monkeypatch: pytest.MonkeyPatch) -> None:
        provider = make_provider()
        sleep_mock = AsyncMock()
        monkeypatch.setattr("app.providers.vonage_api.asyncio.sleep", sleep_mock)
        error = ClientError("429 response from server")
        resp = {"uuid": "leg-1", "conversation_uuid": "conv-1", "status": "started"}
        provider._client.voice.create_call = MagicMock(side_effect=[error, resp])

        await provider.add_participant("123")

        assert provider._client.voice.create_call.call_count == 2
        sleep_mock.assert_awaited_once()

    async def test_network_error_retries_then_succeeds(self, monkeypatch: pytest.MonkeyPatch) -> None:
        provider = make_provider()
        monkeypatch.setattr("app.providers.vonage_api.asyncio.sleep", AsyncMock())
        resp = {"uuid": "leg-1", "conversation_uuid": "conv-1", "status": "started"}
        provider._client.voice.create_call = MagicMock(side_effect=[ReadTimeout("timeout"), resp])

        await provider.add_participant("123")

        assert provider._client.voice.create_call.call_count == 2

    async def test_connection_error_retries_then_succeeds(self, monkeypatch: pytest.MonkeyPatch) -> None:
        provider = make_provider()
        monkeypatch.setattr("app.providers.vonage_api.asyncio.sleep", AsyncMock())
        resp = {"uuid": "leg-1", "conversation_uuid": "conv-1", "status": "started"}
        provider._client.voice.create_call = MagicMock(
            side_effect=[RequestsConnectionError("down"), resp]
        )

        await provider.add_participant("123")

        assert provider._client.voice.create_call.call_count == 2

    async def test_non_retryable_error_raises_immediately(self) -> None:
        provider = make_provider()
        provider._client.voice.create_call = MagicMock(side_effect=ValueError("boom"))

        with pytest.raises(ValueError, match="boom"):
            await provider.add_participant("123")

        assert provider._client.voice.create_call.call_count == 1

    async def test_non_429_client_error_not_retried(self) -> None:
        provider = make_provider()
        provider._client.voice.create_call = MagicMock(side_effect=ClientError("unauthorized"))

        with pytest.raises(ClientError, match="unauthorized"):
            await provider.add_participant("123")

        assert provider._client.voice.create_call.call_count == 1

    async def test_exhausts_retries_and_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        provider = make_provider()
        monkeypatch.setattr("app.providers.vonage_api.asyncio.sleep", AsyncMock())
        error = ClientError("429 response from server")
        provider._client.voice.create_call = MagicMock(side_effect=error)

        with pytest.raises(ClientError, match="429"):
            await provider.add_participant("123")

        assert provider._client.voice.create_call.call_count == 5


class TestAddParticipantToConference:
    async def test_adds_unmuted_participant_and_saves_to_redis(self) -> None:
        provider = make_provider()
        provider.teacher_phone_number = "123"
        provider._client.voice.create_call = MagicMock(
            return_value={"uuid": "leg-1", "conversation_uuid": "conv-1", "status": "started"}
        )

        await provider.add_participant("123", announce_text="Alice")

        call_data = provider._client.voice.create_call.call_args.args[0]
        ncco = call_data["ncco"]
        talk_texts = [step["text"] for step in ncco if step.get("action") == "talk"]
        assert any("Alice has joined" in text for text in talk_texts)
        conversation_steps = [step for step in ncco if step.get("action") == "conversation"]
        assert conversation_steps[0].get("mute") is not True

        saved = await provider.redis_store.get_participant("conf-1", "123")
        assert saved == VonageParticipantInfo(
            phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1"
        )

    async def test_adds_muted_participant_without_redis(self) -> None:
        provider = make_provider(redis_store=None)
        provider.teacher_phone_number = "someone-else"
        provider._client.voice.create_call = MagicMock(
            return_value={"uuid": "leg-1", "conversation_uuid": "conv-1", "status": "started"}
        )

        await provider.add_participant("123")

        call_data = provider._client.voice.create_call.call_args.args[0]
        ncco = call_data["ncco"]
        conversation_steps = [step for step in ncco if step.get("action") == "conversation"]
        assert conversation_steps[0]["mute"] is True
        assert provider.redis_store is None


class TestTryConnectingWebsocketWithParticipant:
    async def test_get_call_times_out_returns_false(self, caplog: LogCaptureFixture) -> None:
        provider = make_provider(call_timeout_seconds=0.01)
        await _seed_participant(provider, "123")

        async def slow_get_call(*args, **kwargs):
            import asyncio

            await asyncio.sleep(1)

        provider._client.voice.get_call = MagicMock(side_effect=lambda **kwargs: None)
        with patch("app.providers.vonage_api.asyncio.to_thread", slow_get_call):
            with caplog.at_level(logging.WARNING, logger="app.providers.vonage_api"):
                await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        assert provider.is_websocket_connected is False

    async def test_get_call_raises_returns_false(self, caplog: LogCaptureFixture) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123")
        provider._client.voice.get_call = MagicMock(side_effect=RuntimeError("boom"))

        with caplog.at_level(logging.ERROR, logger="app.providers.vonage_api"):
            await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        assert provider.is_websocket_connected is False

    async def test_call_not_answered_returns_false(self, caplog: LogCaptureFixture) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123")
        provider._client.voice.get_call = MagicMock(return_value={"status": "ringing"})

        with caplog.at_level(logging.INFO, logger="app.providers.vonage_api"):
            await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        assert provider.is_websocket_connected is False
        provider._client.voice.update_call.assert_not_called()

    async def test_update_call_times_out_returns_false(self, caplog: LogCaptureFixture) -> None:
        provider = make_provider(call_timeout_seconds=0.05)
        await _seed_participant(provider, "123")
        provider._client.voice.get_call = MagicMock(return_value={"status": "answered"})

        import asyncio

        real_to_thread = asyncio.to_thread

        async def maybe_slow(func, **kwargs):
            if func is provider._client.voice.update_call:
                await asyncio.sleep(1)
                return None
            return await real_to_thread(func, **kwargs)

        with patch("app.providers.vonage_api.asyncio.to_thread", maybe_slow):
            with caplog.at_level(logging.WARNING, logger="app.providers.vonage_api"):
                await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        assert provider.is_websocket_connected is False

    async def test_update_call_raises_returns_false(self, caplog: LogCaptureFixture) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123")
        provider._client.voice.get_call = MagicMock(return_value={"status": "answered"})
        provider._client.voice.update_call = MagicMock(side_effect=RuntimeError("boom"))

        with caplog.at_level(logging.ERROR, logger="app.providers.vonage_api"):
            await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        assert provider.is_websocket_connected is False

    async def test_attaches_successfully(self, monkeypatch: pytest.MonkeyPatch) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123")
        provider._client.voice.get_call = MagicMock(return_value={"status": "answered"})
        provider._client.voice.update_call = MagicMock(return_value=None)
        monkeypatch.setattr("app.providers.vonage_api.asyncio.sleep", AsyncMock())

        await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        assert provider.is_websocket_connected is True
        kwargs = provider._client.voice.update_call.call_args.kwargs
        assert kwargs["uuid"] == "leg-1"
        params = kwargs["params"]
        assert params["action"] == "transfer"
        ncco = params["destination"]["ncco"]
        connect_step = next(step for step in ncco if step["action"] == "connect")
        endpoint = connect_step["endpoint"][0]
        assert endpoint["type"] == "websocket"
        assert endpoint["uri"] == "wss://ws.example.com"
        assert endpoint["content-type"] == "audio/l16;rate=8000"
        conversation_step = next(step for step in ncco if step["action"] == "conversation")
        assert conversation_step["name"] == "conf-1"


class TestStartConf:
    async def test_dials_teacher_and_students_in_batches(self) -> None:
        provider = make_provider()
        calls: list[str] = []

        async def fake_add(phone_number, start_muted=False, announce_text=None):
            calls.append(phone_number)

        with patch.object(provider, "_add_participant_to_conference", side_effect=fake_add):
            with patch("app.providers.vonage_api.asyncio.sleep", AsyncMock()):
                await provider.start_conf("teacher", ["s1", "s2"])

        assert set(calls) == {"teacher", "s1", "s2"}
        assert provider.teacher_phone_number == "teacher"


class TestEndConf:
    async def test_hangs_up_answered_participants(self) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123")
        provider._client.voice.get_call = MagicMock(return_value={"status": "answered"})
        provider._client.voice.update_call = MagicMock(return_value=None)

        await provider.end_conf()

        provider._client.voice.update_call.assert_called_once_with(uuid="leg-1", action="hangup")

    async def test_skips_hangup_for_non_answered_participant(self) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123", call_leg_id="leg-1")
        provider._client.voice.get_call = MagicMock(return_value={"status": "ringing"})
        provider._client.voice.update_call = MagicMock(return_value=None)

        await provider.end_conf()

        provider._client.voice.update_call.assert_not_called()

    async def test_per_participant_failure_is_swallowed_and_continues(self, caplog: LogCaptureFixture) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123", call_leg_id="leg-1")
        p2 = VonageParticipantInfo(phone_number="456", call_leg_id="leg-2", initial_conv_id="conv-2")
        await provider.redis_store.save_participant("conf-1", p2)

        def fake_get_call(*, uuid):
            if uuid == "leg-1":
                raise RuntimeError("boom")
            return {"status": "answered"}

        provider._client.voice.get_call = MagicMock(side_effect=fake_get_call)
        provider._client.voice.update_call = MagicMock(return_value=None)

        with caplog.at_level(logging.WARNING, logger="app.providers.vonage_api"):
            await provider.end_conf()

        provider._client.voice.update_call.assert_called_once_with(uuid="leg-2", action="hangup")


class TestHandleCallTransferEvent:
    async def test_no_redis_store_returns_none(self) -> None:
        provider = make_provider(redis_store=None)

        result = await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        assert result is None

    async def test_unknown_participant_returns_none(self) -> None:
        provider = make_provider()

        result = await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        assert result is None

    async def test_known_participant_returns_phone_number(self, monkeypatch: pytest.MonkeyPatch) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123")
        provider._client.voice.get_call = MagicMock(return_value={"status": "ringing"})

        result = await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        assert result == "123"

    async def test_does_not_overwrite_existing_vonage_conv_id(self) -> None:
        provider = make_provider()
        provider.vonage_conv_id = "existing-conv"
        await _seed_participant(provider, "123")
        provider._client.voice.get_call = MagicMock(return_value={"status": "ringing"})

        await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        assert provider.vonage_conv_id == "existing-conv"

    async def test_already_websocket_connected_skips_attach(self) -> None:
        provider = make_provider()
        provider.is_websocket_connected = True
        await _seed_participant(provider, "123")
        provider._client.voice.get_call = MagicMock(return_value={"status": "ringing"})

        await provider.handle_call_transfer_event("leg-1", "conv-to-1")

        provider._client.voice.get_call.assert_not_called()


class TestAddParticipant:
    async def test_teacher_not_muted(self) -> None:
        provider = make_provider()
        provider.teacher_phone_number = "123"
        captured: dict[str, Any] = {}

        async def fake_add(phone_number, start_muted=False, announce_text=None):
            captured["start_muted"] = start_muted

        with patch.object(provider, "_add_participant_to_conference", side_effect=fake_add):
            await provider.add_participant("123")

        assert captured["start_muted"] is False

    async def test_non_teacher_muted(self) -> None:
        provider = make_provider()
        provider.teacher_phone_number = "teacher"
        captured: dict[str, Any] = {}

        async def fake_add(phone_number, start_muted=False, announce_text=None):
            captured["start_muted"] = start_muted

        with patch.object(provider, "_add_participant_to_conference", side_effect=fake_add):
            await provider.add_participant("123")

        assert captured["start_muted"] is True


class TestRemoveParticipant:
    async def test_removes_known_participant(self) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123")
        provider._client.voice.update_call = MagicMock(return_value=None)

        await provider.remove_participant("123")

        provider._client.voice.update_call.assert_called_once_with(
            uuid="leg-1", action="hangup"
        )

    async def test_unknown_participant_is_noop(self) -> None:
        provider = make_provider()

        await provider.remove_participant("123")

        provider._client.voice.update_call.assert_not_called()

    async def test_no_redis_store_is_noop(self) -> None:
        provider = make_provider(redis_store=None)

        await provider.remove_participant("123")

        provider._client.voice.update_call.assert_not_called()


class TestMuteUnmuteParticipant:
    async def test_mute_calls_update_call_with_mute_action(self) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123")
        provider._client.voice.update_call = MagicMock(return_value=None)

        await provider.mute_participant("123")

        provider._client.voice.update_call.assert_called_once_with(uuid="leg-1", action="mute")

    async def test_unmute_calls_update_call_with_unmute_action(self) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123")
        provider._client.voice.update_call = MagicMock(return_value=None)

        await provider.unmute_participant("123")

        provider._client.voice.update_call.assert_called_once_with(uuid="leg-1", action="unmute")

    async def test_mute_unknown_participant_is_noop(self) -> None:
        provider = make_provider()

        await provider.mute_participant("123")

        provider._client.voice.update_call.assert_not_called()

    async def test_unmute_no_redis_store_is_noop(self) -> None:
        provider = make_provider(redis_store=None)

        await provider.unmute_participant("123")

        provider._client.voice.update_call.assert_not_called()


class TestPlayTtsToCallLeg:
    async def test_uses_create_talk_when_available(self) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123", call_leg_id="leg-1")
        provider._client.voice.create_talk = MagicMock(return_value=None)

        await provider.play_announcement_to_conference("hello", phone_numbers=["123"])

        provider._client.voice.create_talk.assert_called_once_with(uuid="leg-1", text="hello")

    async def test_falls_back_to_transfer_when_create_talk_raises(self) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123", call_leg_id="leg-1")
        provider._client.voice.create_talk = MagicMock(side_effect=RuntimeError("boom"))
        provider._client.voice.update_call = MagicMock(return_value=None)

        await provider.play_announcement_to_conference("hello", phone_numbers=["123"])

        kwargs = provider._client.voice.update_call.call_args.kwargs
        assert kwargs["uuid"] == "leg-1"
        ncco = kwargs["params"]["destination"]["ncco"]
        talk_step = next(step for step in ncco if step["action"] == "talk")
        assert talk_step["text"] == "hello"

    async def test_falls_back_to_transfer_when_create_talk_unavailable(self) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123", call_leg_id="leg-1")
        del provider._client.voice.create_talk
        provider._client.voice.update_call = MagicMock(return_value=None)

        await provider.play_announcement_to_conference("hello", phone_numbers=["123"])

        kwargs = provider._client.voice.update_call.call_args.kwargs
        ncco = kwargs["params"]["destination"]["ncco"]
        talk_step = next(step for step in ncco if step["action"] == "talk")
        assert talk_step["text"] == "hello"

    async def test_logs_warning_when_transfer_fallback_also_fails(
        self, caplog: LogCaptureFixture
    ) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123", call_leg_id="leg-1")
        provider._client.voice.create_talk = MagicMock(side_effect=RuntimeError("boom"))
        provider._client.voice.update_call = MagicMock(side_effect=RuntimeError("boom2"))

        with caplog.at_level(logging.WARNING, logger="app.providers.vonage_api"):
            await provider.play_announcement_to_conference("hello", phone_numbers=["123"])

        assert "TTS transfer failed" in caplog.text


class TestPlayAnnouncementToConference:
    async def test_no_redis_store_is_noop(self) -> None:
        provider = make_provider(redis_store=None)

        await provider.play_announcement_to_conference("hello")

        assert True

    async def test_plays_to_explicit_recipients(self) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123", call_leg_id="leg-1")
        await _seed_participant(provider, "456", call_leg_id="leg-2")
        played: list[str] = []

        async def fake_play(call_leg_id, text):
            played.append(call_leg_id)
            return True

        with patch.object(provider, "_play_tts_to_call_leg", side_effect=fake_play):
            await provider.play_announcement_to_conference("hello", phone_numbers=["123"])

        assert played == ["leg-1"]

    async def test_plays_to_all_participants_when_none_specified(self) -> None:
        provider = make_provider()
        await _seed_participant(provider, "123", call_leg_id="leg-1")
        await _seed_participant(provider, "456", call_leg_id="leg-2")
        played: list[str] = []

        async def fake_play(call_leg_id, text):
            played.append(call_leg_id)
            return True

        with patch.object(provider, "_play_tts_to_call_leg", side_effect=fake_play):
            await provider.play_announcement_to_conference("hello")

        assert set(played) == {"leg-1", "leg-2"}


class TestReconnectWebsocket:
    async def test_connects_on_first_attempt_for_matching_participant(self) -> None:
        provider = make_provider()
        provider.vonage_conv_id = "conv-match"
        await _seed_participant(
            provider, "123", call_leg_id="leg-1", conference_conv_id="conv-match"
        )
        await _seed_participant(
            provider, "456", call_leg_id="leg-2", conference_conv_id="conv-other"
        )

        async def fake_attach(participant):
            provider.is_websocket_connected = True
            return True

        with patch.object(
            provider, "_try_connecting_websocket_with_participant", AsyncMock(side_effect=fake_attach)
        ) as mock_attach:
            await provider.reconnect_websocket()

        assert provider.is_websocket_connected is True
        mock_attach.assert_awaited_once()
        matching = mock_attach.call_args.args[0]
        assert matching.phone_number == "123"

    async def test_retries_with_sleep_until_connected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        provider = make_provider()
        provider.vonage_conv_id = "conv-match"
        await _seed_participant(
            provider, "123", call_leg_id="leg-1", conference_conv_id="conv-match"
        )
        sleep_mock = AsyncMock()
        monkeypatch.setattr("app.providers.vonage_api.asyncio.sleep", sleep_mock)

        attempts = {"count": 0}

        async def fake_attach(participant):
            attempts["count"] += 1
            if attempts["count"] < 2:
                return False
            provider.is_websocket_connected = True
            return True

        with patch.object(
            provider, "_try_connecting_websocket_with_participant", AsyncMock(side_effect=fake_attach)
        ):
            await provider.reconnect_websocket()

        assert provider.is_websocket_connected is True
        sleep_mock.assert_awaited()

    async def test_no_matching_participant_still_sleeps_and_retries(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        provider = make_provider()
        provider.vonage_conv_id = "conv-match"

        sleep_calls = {"count": 0}

        async def fake_sleep(_seconds):
            sleep_calls["count"] += 1
            if sleep_calls["count"] >= 2:
                provider.is_websocket_connected = True

        monkeypatch.setattr("app.providers.vonage_api.asyncio.sleep", fake_sleep)

        await provider.reconnect_websocket()

        assert sleep_calls["count"] >= 2
