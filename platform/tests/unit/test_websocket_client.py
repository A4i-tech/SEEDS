"""Control channel to websocket-service — envelope, connect/reconnect, dispatch, and send."""

from __future__ import annotations

import asyncio
import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
import websockets

from app.models.playback_state import ContentStatus
from app.models.ws_service_message import MessageType
from app.providers import websocket_client
from app.providers.websocket_client import (
    WebsocketClientProvider,
    WebsocketServiceMessage,
    get_websocket_service,
)
from app.services.confevents.playback_state_update_event import PlaybackStateUpdateEvent
from app.services.confevents.reconnect_comm_api_websocket_event import (
    ReconnectCommApiWebsocketEvent,
)

CONF_ID = "conf-1"
_real_sleep = asyncio.sleep


async def _no_backoff(*_args) -> None:
    await _real_sleep(0)


async def _let_workers_run(times: int = 4) -> None:
    for _ in range(times):
        await _real_sleep(0)


@pytest.fixture(autouse=True)
def fresh_singleton(monkeypatch):
    """WebsocketClientProvider is a process-wide singleton — do not leak it between tests."""
    monkeypatch.setattr(WebsocketClientProvider, "_instance", None)
    monkeypatch.setattr(websocket_client.asyncio, "sleep", _no_backoff)
    yield
    WebsocketClientProvider._instance = None


@pytest.fixture
def settings(monkeypatch):
    values = SimpleNamespace(websocket_service_url="wss://ws.test/socket", ws_control_secret="")
    monkeypatch.setattr(websocket_client, "get_settings", lambda: values)
    return values


@pytest.fixture
def socket():
    ws = MagicMock()
    ws.send = AsyncMock()
    ws.close = AsyncMock()
    ws.__aiter__ = lambda self: iter([])
    return ws


@pytest.fixture
def connect(monkeypatch, socket):
    connect = AsyncMock(return_value=socket)
    monkeypatch.setattr(websocket_client.websockets, "connect", connect)
    return connect


@pytest.fixture
def conf():
    conf = MagicMock()
    conf.queue_event = AsyncMock()
    conf._remote_audio_queue = None
    return conf


@pytest.fixture
def manager(conf):
    manager = MagicMock()
    manager.get_conference.return_value = conf
    return manager


@pytest.fixture
async def provider(settings, connect, manager):
    provider = WebsocketClientProvider()
    await provider.initialize(manager)
    await provider.close()
    provider.is_connected = True
    return provider


class TestMessageEnvelope:
    def test_optional_fields_are_left_out_when_unset(self) -> None:
        message = WebsocketServiceMessage(websocket_id=CONF_ID, type="play", message="url")
        assert message.model_dump() == {
            "websocket_id": CONF_ID, "type": "play", "message": "url"
        }

    def test_optional_fields_are_included_when_set(self) -> None:
        message = WebsocketServiceMessage(
            websocket_id=CONF_ID, type="playback-state-update", position_seconds=1.0,
            duration_seconds=2.0, speed=1.5,
        )
        assert message.model_dump() == {
            "websocket_id": CONF_ID, "type": "playback-state-update", "message": "",
            "position_seconds": 1.0, "duration_seconds": 2.0, "speed": 1.5,
        }

    def test_the_json_form_round_trips(self) -> None:
        message = WebsocketServiceMessage(websocket_id=CONF_ID, type="pause")
        assert json.loads(message.model_dump_json()) == message.model_dump()


class TestSingleton:
    def test_every_construction_returns_the_same_client(self) -> None:
        assert WebsocketClientProvider() is WebsocketClientProvider()

    @pytest.mark.asyncio
    async def test_the_service_getter_returns_that_same_client(self) -> None:
        assert await get_websocket_service() is WebsocketClientProvider()


class TestConnect:
    @pytest.mark.asyncio
    async def test_initialize_connects_to_the_configured_url_and_starts_workers(
        self, settings, connect, manager
    ) -> None:
        provider = WebsocketClientProvider()
        await provider.initialize(manager)

        assert connect.await_args.args[0] == "wss://ws.test/socket?id=confv2server"
        assert provider.is_connected is True
        assert len(provider._bg_tasks) == 2
        await provider.close()

    @pytest.mark.asyncio
    async def test_the_control_secret_is_sent_as_a_handshake_header(
        self, settings, connect, manager
    ) -> None:
        settings.ws_control_secret = "s3cret"
        provider = WebsocketClientProvider()
        await provider.initialize(manager)

        assert connect.await_args.kwargs["additional_headers"] == {"WS-Control-Secret": "s3cret"}
        await provider.close()

    @pytest.mark.asyncio
    async def test_no_secret_means_no_header(self, settings, connect, manager) -> None:
        provider = WebsocketClientProvider()
        await provider.initialize(manager)

        assert connect.await_args.kwargs["additional_headers"] == {}
        await provider.close()

    @pytest.mark.asyncio
    async def test_a_failed_connect_is_retried_until_it_succeeds(
        self, settings, connect, manager, socket
    ) -> None:
        connect.side_effect = [OSError("refused"), OSError("refused"), socket]
        provider = WebsocketClientProvider()

        await provider.initialize(manager)

        assert connect.await_count == 3
        assert provider.reconnect_attempts == 0
        await provider.close()

    @pytest.mark.asyncio
    async def test_an_established_connection_is_not_reopened(self, provider, connect) -> None:
        connect.reset_mock()
        await provider._connect()
        connect.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_close_cancels_the_workers_and_shuts_the_socket(
        self, settings, connect, manager, socket
    ) -> None:
        provider = WebsocketClientProvider()
        await provider.initialize(manager)
        tasks = list(provider._bg_tasks)

        await provider.close()

        assert provider._bg_tasks == []
        assert all(task.cancelled() or task.cancelling() for task in tasks)
        socket.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_a_socket_that_refuses_to_close_does_not_raise(
        self, settings, connect, manager, socket
    ) -> None:
        socket.close.side_effect = RuntimeError("already gone")
        provider = WebsocketClientProvider()
        await provider.initialize(manager)

        await provider.close()


class TestSendMessage:
    @pytest.mark.asyncio
    async def test_a_message_is_serialised_onto_the_socket(self, provider, socket) -> None:
        await provider.send_message(
            WebsocketServiceMessage(websocket_id=CONF_ID, type="play", message="url")
        )
        assert json.loads(socket.send.await_args.args[0]) == {
            "websocket_id": CONF_ID, "type": "play", "message": "url"
        }

    @pytest.mark.asyncio
    async def test_sending_while_disconnected_is_an_error(self, provider) -> None:
        provider.is_connected = False
        with pytest.raises(ConnectionError, match="not connected"):
            await provider.send_message(WebsocketServiceMessage(websocket_id=CONF_ID, type="play"))

    @pytest.mark.asyncio
    async def test_a_send_failure_reconnects_and_re_raises(
        self, provider, socket, connect
    ) -> None:
        socket.send.side_effect = RuntimeError("broken pipe")

        with pytest.raises(RuntimeError, match="broken pipe"):
            await provider.send_message(WebsocketServiceMessage(websocket_id=CONF_ID, type="play"))

        assert connect.await_count > 1

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("call", "expected_type"),
        [
            (lambda p: p.pause_audio(CONF_ID), MessageType.PAUSE_AUDIO),
            (lambda p: p.resume_audio(CONF_ID), MessageType.RESUME_AUDIO),
            (lambda p: p.disconnect(CONF_ID), MessageType.DISCONNECT),
        ],
    )
    async def test_the_playback_helpers_send_their_message_type(
        self, provider, socket, call, expected_type
    ) -> None:
        await call(provider)
        sent = json.loads(socket.send.await_args.args[0])
        assert (sent["websocket_id"], sent["type"]) == (CONF_ID, expected_type)

    @pytest.mark.asyncio
    async def test_setting_the_speed_sends_it_both_ways(self, provider, socket) -> None:
        await provider.set_playback_speed(CONF_ID, 1.5)
        sent = json.loads(socket.send.await_args.args[0])
        assert (sent["type"], sent["message"], sent["speed"]) == (
            MessageType.SET_SPEED, "1.5", 1.5,
        )


class TestDispatchMessage:
    @pytest.mark.asyncio
    async def test_a_playback_state_update_is_queued_on_the_conference(
        self, provider, conf
    ) -> None:
        await provider._dispatch_message(json.dumps({
            "websocket_id": CONF_ID,
            "type": MessageType.PLAYBACK_STATE_UPDATES,
            "message": ContentStatus.PLAYING.value,
            "position_seconds": 12.0,
            "duration_seconds": 300.0,
            "speed": 1.25,
        }))

        queued = conf.queue_event.await_args.args[0]
        assert isinstance(queued, PlaybackStateUpdateEvent)
        assert (queued.content_state, queued.position_seconds, queued.speed) == (
            ContentStatus.PLAYING, 12.0, 1.25,
        )

    @pytest.mark.asyncio
    async def test_audio_data_is_decoded_onto_the_relay_queue(self, provider, conf) -> None:
        conf._remote_audio_queue = asyncio.Queue()
        await provider._dispatch_message(json.dumps({
            "websocket_id": CONF_ID,
            "type": MessageType.AUDIO_DATA,
            "message": base64.b64encode(b"pcm-bytes").decode(),
        }))

        assert conf._remote_audio_queue.get_nowait() == b"pcm-bytes"

    @pytest.mark.asyncio
    async def test_audio_data_without_a_relay_queue_is_dropped(self, provider, conf) -> None:
        await provider._dispatch_message(json.dumps({
            "websocket_id": CONF_ID,
            "type": MessageType.AUDIO_DATA,
            "message": base64.b64encode(b"pcm-bytes").decode(),
        }))
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_a_full_relay_queue_drops_the_chunk_instead_of_raising(
        self, provider, conf, caplog
    ) -> None:
        conf._remote_audio_queue = asyncio.Queue(maxsize=1)
        conf._remote_audio_queue.put_nowait(b"already-here")

        await provider._dispatch_message(json.dumps({
            "websocket_id": CONF_ID,
            "type": MessageType.AUDIO_DATA,
            "message": base64.b64encode(b"pcm-bytes").decode(),
        }))

        assert conf._remote_audio_queue.qsize() == 1
        assert "audio relay queue full" in caplog.text

    @pytest.mark.asyncio
    async def test_a_reconnect_request_is_queued_on_the_conference(self, provider, conf) -> None:
        await provider._dispatch_message(
            json.dumps({"websocket_id": CONF_ID, "type": MessageType.RECONNECT})
        )
        assert isinstance(conf.queue_event.await_args.args[0], ReconnectCommApiWebsocketEvent)

    @pytest.mark.asyncio
    async def test_a_message_for_an_unknown_conference_is_dropped(
        self, provider, manager, conf
    ) -> None:
        manager.get_conference.return_value = None
        await provider._dispatch_message(
            json.dumps({"websocket_id": "nope", "type": MessageType.RECONNECT})
        )
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_a_message_arriving_before_initialisation_is_dropped(
        self, provider, conf
    ) -> None:
        provider._conference_manager = None
        await provider._dispatch_message(
            json.dumps({"websocket_id": CONF_ID, "type": MessageType.RECONNECT})
        )
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_a_non_json_message_is_ignored(self, provider, conf) -> None:
        await provider._dispatch_message("not json at all")
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_an_unrecognised_message_type_is_ignored(self, provider, conf) -> None:
        await provider._dispatch_message(
            json.dumps({"websocket_id": CONF_ID, "type": "something-else"})
        )
        conf.queue_event.assert_not_awaited()


class TestBackgroundWorkers:
    @pytest.mark.asyncio
    async def test_the_heartbeat_pings_while_connected(self, provider, socket) -> None:
        task = asyncio.create_task(provider._send_heartbeat())
        await _let_workers_run()
        task.cancel()

        assert json.loads(socket.send.await_args.args[0])["type"] == "heartbeat"

    @pytest.mark.asyncio
    async def test_a_failed_heartbeat_triggers_a_reconnect(
        self, provider, socket, connect
    ) -> None:
        socket.send.side_effect = RuntimeError("broken pipe")
        connect.reset_mock()

        task = asyncio.create_task(provider._send_heartbeat())
        await _let_workers_run()
        task.cancel()

        assert connect.await_count >= 1

    @pytest.mark.asyncio
    async def test_a_closed_connection_is_reconnected_by_the_listener(
        self, provider, socket, connect
    ) -> None:
        async def _closes_mid_stream(self):
            """A closed socket yields what it had, then raises on the next frame."""
            yield json.dumps({"websocket_id": CONF_ID, "type": "ignored"})
            raise websockets.exceptions.ConnectionClosedOK(None, None)

        socket.__aiter__ = _closes_mid_stream
        dispatched = []
        provider._dispatch_message = AsyncMock(side_effect=dispatched.append)
        connected_when_reconnecting = []
        connect.reset_mock()
        connect.side_effect = lambda *_a, **_kw: (
            connected_when_reconnecting.append(provider.is_connected) or socket
        )

        task = asyncio.create_task(provider._listen_messages())
        await _let_workers_run()
        task.cancel()

        assert dispatched, "the frames the socket did deliver must still be dispatched"
        assert connected_when_reconnecting[0] is False, "the close must be recorded before retrying"

    @pytest.mark.asyncio
    async def test_inbound_frames_reach_the_dispatcher(self, provider, socket, conf) -> None:
        frame = json.dumps({"websocket_id": CONF_ID, "type": MessageType.RECONNECT})

        async def _frames(self):
            yield frame

        socket.__aiter__ = _frames

        task = asyncio.create_task(provider._listen_messages())
        await _let_workers_run()
        task.cancel()

        conf.queue_event.assert_awaited()
