"""Tests for app.providers.vonage_api.VonageAPIProvider."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.providers.vonage_api import (
    ClientError,
    ReadTimeout,
    RequestsConnectionError,
    VonageAPIProvider,
    VonageParticipantInfo,
)


class FakeRedisStore:
    def __init__(self) -> None:
        self.participants: dict[str, dict[str, VonageParticipantInfo]] = {}

    async def save_participant(self, conf_id: str, participant: VonageParticipantInfo) -> None:
        self.participants.setdefault(conf_id, {})[participant.phone_number] = participant

    async def get_participant(self, conf_id: str, phone_number: str) -> VonageParticipantInfo | None:
        return self.participants.get(conf_id, {}).get(phone_number)

    async def get_all_participants(self, conf_id: str) -> dict[str, VonageParticipantInfo]:
        return dict(self.participants.get(conf_id, {}))

    async def get_participant_by_leg_id(self, conf_id: str, leg_id: str) -> VonageParticipantInfo | None:
        for p in self.participants.get(conf_id, {}).values():
            if p.call_leg_id == leg_id:
                return p
        return None

    async def delete_participant(self, conf_id: str, phone_number: str) -> None:
        self.participants.get(conf_id, {}).pop(phone_number, None)


def make_provider(**overrides: Any) -> VonageAPIProvider:
    with patch("vonage.Client", return_value=MagicMock()):
        kwargs: dict[str, Any] = {
            "application_id": "app-id",
            "private_key": "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
            "vonage_number": "15551234567",
            "conf_id": "conf-1",
            "ws_server_url": "wss://ws.example.com",
            "events_webhook_url": "https://events.example.com",
            "call_timeout_seconds": 5.0,
        }
        kwargs.update(overrides)
        return VonageAPIProvider(**kwargs)


class TestVonageParticipantInfo:
    def test_required_fields(self) -> None:
        info = VonageParticipantInfo(
            phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1"
        )
        assert info.conference_conv_id is None

    def test_conference_conv_id_optional_override(self) -> None:
        info = VonageParticipantInfo(
            phone_number="123",
            call_leg_id="leg-1",
            initial_conv_id="conv-1",
            conference_conv_id="conv-2",
        )
        assert info.conference_conv_id == "conv-2"


class TestInit:
    def test_init_sets_fields(self) -> None:
        provider = make_provider()
        assert provider.conf_id == "conf-1"
        assert provider.ws_server_url == "wss://ws.example.com"
        assert provider.events_webhook_url == "https://events.example.com"
        assert provider.vonage_conv_id is None
        assert provider.is_websocket_connected is False
        assert provider.teacher_phone_number is None
        assert provider.redis_store is None

    def test_init_decodes_base64_private_key(self) -> None:
        import base64

        raw_key = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
        encoded_key = base64.b64encode(raw_key.encode("utf-8")).decode("utf-8")
        with patch("vonage.Client", return_value=MagicMock()) as client_cls:
            VonageAPIProvider(
                application_id="app-id",
                private_key=encoded_key,
                vonage_number="15551234567",
                conf_id="conf-1",
            )
        assert client_cls.call_args.kwargs["private_key"] == raw_key

    def test_init_leaves_pem_private_key_untouched(self) -> None:
        raw_key = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
        with patch("vonage.Client", return_value=MagicMock()) as client_cls:
            VonageAPIProvider(
                application_id="app-id",
                private_key=raw_key,
                vonage_number="15551234567",
                conf_id="conf-1",
            )
        assert client_cls.call_args.kwargs["private_key"] == raw_key


class TestCreateCallWithRetry:
    @pytest.mark.asyncio
    async def test_success_first_attempt(self) -> None:
        provider = make_provider()
        provider._client.voice.create_call = MagicMock(return_value={"status": "started", "uuid": "leg-1"})
        resp = await provider._create_call_with_retry({"to": []}, "123")
        assert resp == {"status": "started", "uuid": "leg-1"}
        provider._client.voice.create_call.assert_called_once_with({"to": []})

    @pytest.mark.asyncio
    async def test_rate_limited_retries_then_succeeds(self) -> None:
        provider = make_provider()
        err = ClientError("429 response from server")
        provider._client.voice.create_call = MagicMock(
            side_effect=[err, {"status": "started", "uuid": "leg-1"}]
        )
        with patch("app.providers.vonage_api.asyncio.sleep", AsyncMockCompat()) as sleep_mock:
            resp = await provider._create_call_with_retry({"to": []}, "123", max_retries=5)
        assert resp == {"status": "started", "uuid": "leg-1"}
        assert provider._client.voice.create_call.call_count == 2
        assert sleep_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_network_error_retries_then_succeeds(self) -> None:
        provider = make_provider()
        provider._client.voice.create_call = MagicMock(
            side_effect=[ReadTimeout("timeout"), {"status": "started", "uuid": "leg-1"}]
        )
        with patch("app.providers.vonage_api.asyncio.sleep", AsyncMockCompat()):
            resp = await provider._create_call_with_retry({"to": []}, "123", max_retries=5)
        assert resp == {"status": "started", "uuid": "leg-1"}

    @pytest.mark.asyncio
    async def test_connection_error_retries_then_succeeds(self) -> None:
        provider = make_provider()
        provider._client.voice.create_call = MagicMock(
            side_effect=[RequestsConnectionError("down"), {"status": "started", "uuid": "leg-1"}]
        )
        with patch("app.providers.vonage_api.asyncio.sleep", AsyncMockCompat()):
            resp = await provider._create_call_with_retry({"to": []}, "123", max_retries=5)
        assert resp == {"status": "started", "uuid": "leg-1"}

    @pytest.mark.asyncio
    async def test_non_retryable_error_raises_immediately(self) -> None:
        provider = make_provider()
        provider._client.voice.create_call = MagicMock(side_effect=ValueError("boom"))
        with pytest.raises(ValueError):
            await provider._create_call_with_retry({"to": []}, "123", max_retries=5)
        assert provider._client.voice.create_call.call_count == 1

    @pytest.mark.asyncio
    async def test_exhausts_retries_and_raises(self) -> None:
        provider = make_provider()
        provider._client.voice.create_call = MagicMock(
            side_effect=ReadTimeout("timeout")
        )
        with patch("app.providers.vonage_api.asyncio.sleep", AsyncMockCompat()):
            with pytest.raises(ReadTimeout):
                await provider._create_call_with_retry({"to": []}, "123", max_retries=3)
        assert provider._client.voice.create_call.call_count == 3


class AsyncMockCompat:
    """Lightweight async-callable test double (avoids importing AsyncMock for this one use)."""

    def __init__(self) -> None:
        self.await_count = 0

    async def __call__(self, *args: Any, **kwargs: Any) -> None:
        self.await_count += 1


class TestAddParticipantToConference:
    @pytest.mark.asyncio
    async def test_adds_unmuted_participant_and_saves_to_redis(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        provider._client.voice.create_call = MagicMock(
            return_value={"status": "started", "uuid": "leg-1", "conversation_uuid": "conv-1"}
        )
        await provider._add_participant_to_conference("123", start_muted=False, announce_text="Alice")
        saved = await provider.redis_store.get_participant("conf-1", "123")
        assert saved is not None
        assert saved.call_leg_id == "leg-1"
        assert saved.initial_conv_id == "conv-1"
        ncco = provider._client.voice.create_call.call_args.args[0]["ncco"]
        assert any("Alice has joined" in step.get("text", "") for step in ncco if step["action"] == "talk")

    @pytest.mark.asyncio
    async def test_adds_muted_participant_without_redis(self) -> None:
        provider = make_provider()
        provider._client.voice.create_call = MagicMock(
            return_value={"status": "started", "uuid": "leg-1", "conversation_uuid": "conv-1"}
        )
        await provider._add_participant_to_conference("123", start_muted=True)
        call_data = provider._client.voice.create_call.call_args.args[0]
        assert call_data["ncco"][0]["action"] == "talk"
        assert "joined the conference" in call_data["ncco"][0]["text"]
        assert call_data["ncco"][-1] == {"action": "conversation", "name": "conf-1", "mute": True}


class TestTryConnectingWebsocketWithParticipant:
    @pytest.mark.asyncio
    async def test_get_call_times_out_returns_false(self) -> None:
        provider = make_provider(call_timeout_seconds=0.01)
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        provider._client.voice.get_call = MagicMock(return_value={"status": "answered"})

        async def fake_wait_for(coro, timeout):
            coro.close()
            raise TimeoutError

        with patch("app.providers.vonage_api.asyncio.wait_for", fake_wait_for):
            result = await provider._try_connecting_websocket_with_participant(participant)
        assert result is False
        provider._client.voice.update_call.assert_not_called()

    @pytest.mark.asyncio
    async def test_get_call_raises_returns_false(self) -> None:
        provider = make_provider()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        provider._client.voice.get_call = MagicMock(side_effect=RuntimeError("boom"))
        result = await provider._try_connecting_websocket_with_participant(participant)
        assert result is False

    @pytest.mark.asyncio
    async def test_call_not_answered_returns_false(self) -> None:
        provider = make_provider()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        provider._client.voice.get_call = MagicMock(return_value={"status": "ringing"})
        result = await provider._try_connecting_websocket_with_participant(participant)
        assert result is False

    @pytest.mark.asyncio
    async def test_update_call_times_out_returns_false(self) -> None:
        provider = make_provider(call_timeout_seconds=0.01)
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        provider._client.voice.get_call = MagicMock(return_value={"status": "answered"})
        provider._client.voice.update_call = MagicMock(return_value=None)

        calls = {"n": 0}

        async def fake_wait_for(coro, timeout):
            calls["n"] += 1
            if calls["n"] == 1:
                return await coro
            coro.close()
            raise TimeoutError

        with patch("app.providers.vonage_api.asyncio.wait_for", fake_wait_for):
            result = await provider._try_connecting_websocket_with_participant(participant)
        assert result is False
        provider._client.voice.get_call.assert_called_once()
        provider._client.voice.update_call.assert_not_called()

    @pytest.mark.asyncio
    async def test_update_call_raises_returns_false(self) -> None:
        provider = make_provider()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        provider._client.voice.get_call = MagicMock(return_value={"status": "answered"})
        provider._client.voice.update_call = MagicMock(side_effect=RuntimeError("boom"))
        result = await provider._try_connecting_websocket_with_participant(participant)
        assert result is False

    @pytest.mark.asyncio
    async def test_attaches_successfully(self) -> None:
        provider = make_provider()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        provider._client.voice.get_call = MagicMock(return_value={"status": "answered"})
        provider._client.voice.update_call = MagicMock(return_value=None)
        with patch("app.providers.vonage_api.asyncio.sleep", AsyncMockCompat()):
            result = await provider._try_connecting_websocket_with_participant(participant)
        assert result is True


class TestGetIsWebsocketConnected:
    def test_returns_current_flag(self) -> None:
        provider = make_provider()
        assert provider.get_is_websocket_connected() is False
        provider.is_websocket_connected = True
        assert provider.get_is_websocket_connected() is True


class TestStartConf:
    @pytest.mark.asyncio
    async def test_dials_teacher_and_students_in_batches(self) -> None:
        provider = make_provider()
        calls: list[str] = []

        async def fake_add(phone_number: str, start_muted: bool = False, announce_text: str | None = None, max_retries: int = 5) -> None:
            calls.append(phone_number)

        with patch.object(provider, "_add_participant_to_conference", side_effect=fake_add), \
                patch("app.providers.vonage_api.asyncio.sleep", AsyncMockCompat()) as sleep_mock:
            await provider.start_conf("teacher-1", ["s1", "s2", "s3", "s4"])

        assert provider.teacher_phone_number == "teacher-1"
        assert set(calls) == {"teacher-1", "s1", "s2", "s3", "s4"}
        assert sleep_mock.await_count == 1


class TestEndConf:
    @pytest.mark.asyncio
    async def test_no_redis_store_just_resets_flag(self) -> None:
        provider = make_provider()
        provider.is_websocket_connected = True
        await provider.end_conf()
        assert provider.is_websocket_connected is False

    @pytest.mark.asyncio
    async def test_hangs_up_answered_participants(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        await provider.redis_store.save_participant("conf-1", participant)
        provider._client.voice.get_call = MagicMock(return_value={"status": "answered"})
        provider._client.voice.update_call = MagicMock(return_value=None)
        await provider.end_conf()
        provider._client.voice.update_call.assert_called_once_with(uuid="leg-1", action="hangup")

    @pytest.mark.asyncio
    async def test_skips_hangup_for_non_answered_participant(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        await provider.redis_store.save_participant("conf-1", participant)
        provider._client.voice.get_call = MagicMock(return_value={"status": "ringing"})
        provider._client.voice.update_call = MagicMock(return_value=None)
        await provider.end_conf()
        provider._client.voice.update_call.assert_not_called()

    @pytest.mark.asyncio
    async def test_hangup_failure_is_logged_not_raised(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        await provider.redis_store.save_participant("conf-1", participant)
        provider._client.voice.get_call = MagicMock(side_effect=RuntimeError("boom"))
        await provider.end_conf()


class TestHandleCallTransferEvent:
    @pytest.mark.asyncio
    async def test_no_redis_store_returns_none(self) -> None:
        provider = make_provider()
        result = await provider.handle_call_transfer_event("leg-1", "conv-to-1")
        assert result is None

    @pytest.mark.asyncio
    async def test_unknown_participant_returns_none(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        result = await provider.handle_call_transfer_event("leg-1", "conv-to-1")
        assert result is None

    @pytest.mark.asyncio
    async def test_sets_vonage_conv_id_and_attaches_websocket(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        await provider.redis_store.save_participant("conf-1", participant)
        with patch.object(provider, "_try_connecting_websocket_with_participant", AsyncReturn(True)):
            result = await provider.handle_call_transfer_event("leg-1", "conv-to-1")
        assert result == "123"
        assert provider.vonage_conv_id == "conv-to-1"
        assert provider.is_websocket_connected is True
        saved = await provider.redis_store.get_participant("conf-1", "123")
        assert saved.conference_conv_id == "conv-to-1"

    @pytest.mark.asyncio
    async def test_does_not_overwrite_existing_vonage_conv_id(self) -> None:
        provider = make_provider()
        provider.vonage_conv_id = "existing-conv"
        provider.is_websocket_connected = True
        provider.redis_store = FakeRedisStore()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        await provider.redis_store.save_participant("conf-1", participant)
        result = await provider.handle_call_transfer_event("leg-1", "conv-to-1")
        assert result == "123"
        assert provider.vonage_conv_id == "existing-conv"


class AsyncReturn:
    def __init__(self, value: Any) -> None:
        self._value = value
        self.calls = 0

    async def __call__(self, *args: Any, **kwargs: Any) -> Any:
        self.calls += 1
        return self._value


class TestAddParticipant:
    @pytest.mark.asyncio
    async def test_teacher_is_not_muted(self) -> None:
        provider = make_provider()
        provider.teacher_phone_number = "teacher-1"
        with patch.object(provider, "_add_participant_to_conference", AsyncReturn(None)) as fake:
            await provider.add_participant("teacher-1", announce_text="Hi")
        assert fake.calls == 1

    @pytest.mark.asyncio
    async def test_non_teacher_starts_muted(self) -> None:
        provider = make_provider()
        provider.teacher_phone_number = "teacher-1"
        captured: dict[str, Any] = {}

        async def fake_add(phone_number: str, start_muted: bool = False, announce_text: str | None = None) -> None:
            captured["start_muted"] = start_muted

        with patch.object(provider, "_add_participant_to_conference", side_effect=fake_add):
            await provider.add_participant("student-1")
        assert captured["start_muted"] is True


class TestRemoveParticipant:
    @pytest.mark.asyncio
    async def test_no_redis_store_is_noop(self) -> None:
        provider = make_provider()
        await provider.remove_participant("123")

    @pytest.mark.asyncio
    async def test_unknown_participant_is_noop(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        provider._client.voice.update_call = MagicMock()
        await provider.remove_participant("123")
        provider._client.voice.update_call.assert_not_called()

    @pytest.mark.asyncio
    async def test_hangs_up_and_deletes_participant(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        await provider.redis_store.save_participant("conf-1", participant)
        provider._client.voice.update_call = MagicMock()
        await provider.remove_participant("123")
        provider._client.voice.update_call.assert_called_once_with(uuid="leg-1", action="hangup")
        assert await provider.redis_store.get_participant("conf-1", "123") is None


class TestMuteUnmuteParticipant:
    @pytest.mark.asyncio
    async def test_mute_no_redis_store_is_noop(self) -> None:
        provider = make_provider()
        await provider.mute_participant("123")

    @pytest.mark.asyncio
    async def test_mute_unknown_participant_is_noop(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        provider._client.voice.update_call = MagicMock()
        await provider.mute_participant("123")
        provider._client.voice.update_call.assert_not_called()

    @pytest.mark.asyncio
    async def test_mute_calls_update_call_with_mute_action(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        await provider.redis_store.save_participant("conf-1", participant)
        provider._client.voice.update_call = MagicMock()
        await provider.mute_participant("123")
        provider._client.voice.update_call.assert_called_once_with(uuid="leg-1", action="mute")

    @pytest.mark.asyncio
    async def test_unmute_no_redis_store_is_noop(self) -> None:
        provider = make_provider()
        await provider.unmute_participant("123")

    @pytest.mark.asyncio
    async def test_unmute_calls_update_call_with_unmute_action(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        participant = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        await provider.redis_store.save_participant("conf-1", participant)
        provider._client.voice.update_call = MagicMock()
        await provider.unmute_participant("123")
        provider._client.voice.update_call.assert_called_once_with(uuid="leg-1", action="unmute")


class TestPlayAnnouncementToConference:
    @pytest.mark.asyncio
    async def test_no_redis_store_is_noop(self) -> None:
        provider = make_provider()
        await provider.play_announcement_to_conference("hello")

    @pytest.mark.asyncio
    async def test_plays_to_explicit_recipients_only(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        p1 = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        p2 = VonageParticipantInfo(phone_number="456", call_leg_id="leg-2", initial_conv_id="conv-2")
        await provider.redis_store.save_participant("conf-1", p1)
        await provider.redis_store.save_participant("conf-1", p2)
        played: list[str] = []

        async def fake_play(call_leg_id: str, text: str) -> bool:
            played.append(call_leg_id)
            return True

        with patch.object(provider, "_play_tts_to_call_leg", side_effect=fake_play):
            await provider.play_announcement_to_conference("hello", phone_numbers=["123"])
        assert played == ["leg-1"]

    @pytest.mark.asyncio
    async def test_skips_unknown_recipient(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        played: list[str] = []

        async def fake_play(call_leg_id: str, text: str) -> bool:
            played.append(call_leg_id)
            return True

        with patch.object(provider, "_play_tts_to_call_leg", side_effect=fake_play):
            await provider.play_announcement_to_conference("hello", phone_numbers=["missing"])
        assert played == []

    @pytest.mark.asyncio
    async def test_defaults_to_all_participants(self) -> None:
        provider = make_provider()
        provider.redis_store = FakeRedisStore()
        p1 = VonageParticipantInfo(phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1")
        await provider.redis_store.save_participant("conf-1", p1)
        played: list[str] = []

        async def fake_play(call_leg_id: str, text: str) -> bool:
            played.append(call_leg_id)
            return True

        with patch.object(provider, "_play_tts_to_call_leg", side_effect=fake_play):
            await provider.play_announcement_to_conference("hello")
        assert played == ["leg-1"]


class TestPlayTtsToCallLeg:
    @pytest.mark.asyncio
    async def test_uses_create_talk_when_available(self) -> None:
        provider = make_provider()
        provider._client.voice.create_talk = MagicMock(return_value=None)
        result = await provider._play_tts_to_call_leg("leg-1", "hello")
        assert result is True
        provider._client.voice.create_talk.assert_called_once_with(uuid="leg-1", text="hello")

    @pytest.mark.asyncio
    async def test_falls_back_to_transfer_when_create_talk_raises(self) -> None:
        provider = make_provider()
        provider._client.voice.create_talk = MagicMock(side_effect=RuntimeError("boom"))
        provider._client.voice.update_call = MagicMock(return_value=None)
        result = await provider._play_tts_to_call_leg("leg-1", "hello")
        assert result is True
        provider._client.voice.update_call.assert_called_once()

    @pytest.mark.asyncio
    async def test_falls_back_to_transfer_when_create_talk_unavailable(self) -> None:
        provider = make_provider()
        del provider._client.voice.create_talk
        provider._client.voice.create_talk = None
        provider._client.voice.update_call = MagicMock(return_value=None)
        result = await provider._play_tts_to_call_leg("leg-1", "hello")
        assert result is True
        provider._client.voice.update_call.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_false_when_transfer_fallback_also_fails(self) -> None:
        provider = make_provider()
        provider._client.voice.create_talk = None
        provider._client.voice.update_call = MagicMock(side_effect=RuntimeError("boom"))
        result = await provider._play_tts_to_call_leg("leg-1", "hello")
        assert result is False


class TestReconnectWebsocket:
    @pytest.mark.asyncio
    async def test_no_redis_store_is_noop(self) -> None:
        provider = make_provider()
        await provider.reconnect_websocket()
        assert provider.is_websocket_connected is False

    @pytest.mark.asyncio
    async def test_attaches_matching_participant_and_terminates(self) -> None:
        provider = make_provider()
        provider.vonage_conv_id = "conv-match"
        provider.redis_store = FakeRedisStore()
        matching = VonageParticipantInfo(
            phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1", conference_conv_id="conv-match"
        )
        other = VonageParticipantInfo(
            phone_number="456", call_leg_id="leg-2", initial_conv_id="conv-2", conference_conv_id="conv-other"
        )
        await provider.redis_store.save_participant("conf-1", matching)
        await provider.redis_store.save_participant("conf-1", other)
        with patch.object(provider, "_try_connecting_websocket_with_participant", AsyncReturn(True)) as fake:
            await provider.reconnect_websocket()
        assert provider.is_websocket_connected is True
        assert fake.calls == 1

    @pytest.mark.asyncio
    async def test_retries_until_match_found(self) -> None:
        provider = make_provider()
        provider.vonage_conv_id = "conv-match"
        provider.redis_store = FakeRedisStore()
        unmatched = VonageParticipantInfo(
            phone_number="123", call_leg_id="leg-1", initial_conv_id="conv-1", conference_conv_id="conv-other"
        )
        await provider.redis_store.save_participant("conf-1", unmatched)

        call_count = 0

        async def fake_sleep(delay: float) -> None:
            nonlocal call_count
            call_count += 1
            matching = VonageParticipantInfo(
                phone_number="123",
                call_leg_id="leg-1",
                initial_conv_id="conv-1",
                conference_conv_id="conv-match",
            )
            await provider.redis_store.save_participant("conf-1", matching)

        with patch("app.providers.vonage_api.asyncio.sleep", side_effect=fake_sleep), \
                patch.object(provider, "_try_connecting_websocket_with_participant", AsyncReturn(True)):
            await provider.reconnect_websocket()
        assert call_count == 1
        assert provider.is_websocket_connected is True
