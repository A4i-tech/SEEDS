"""Coverage for app.providers.smartphone_connection."""

from __future__ import annotations

import asyncio
import json

import pytest

import app.providers.smartphone_connection as smartphone_connection_module
from app.providers.smartphone_connection import (
    SmartphoneConnectionManager,
    SmartphoneConnectionManagerFactory,
)


class TestSmartphoneConnectionManagerFactory:
    def test_create_returns_manager_with_conf_id(self) -> None:
        factory = SmartphoneConnectionManagerFactory()
        mgr = factory.create("conf-1")
        assert isinstance(mgr, SmartphoneConnectionManager)
        assert mgr.conf_id == "conf-1"

    def test_create_returns_independent_instances(self) -> None:
        factory = SmartphoneConnectionManagerFactory()
        mgr1 = factory.create("conf-1")
        mgr2 = factory.create("conf-2")
        assert mgr1 is not mgr2
        assert mgr1._queue is not mgr2._queue


class TestConnect:
    async def test_connect_returns_streaming_response(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        assert resp.media_type == "text/event-stream"
        assert resp.headers["Cache-Control"] == "no-cache"
        assert resp.headers["X-Accel-Buffering"] == "no"

    async def test_connect_yields_message_delivery(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        gen = resp.body_iterator

        await mgr.send_message_to_client(client=None, message={"a": 1})
        chunk = await gen.__anext__()
        assert chunk == f'data: {json.dumps({"a": 1})}\n\n'

    async def test_connect_serializes_list_payload(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        gen = resp.body_iterator

        await mgr.send_message_to_client(client=None, message=[1, 2, 3])
        chunk = await gen.__anext__()
        assert chunk == f"data: {json.dumps([1, 2, 3])}\n\n"

    async def test_connect_sentinel_ends_stream(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        gen = resp.body_iterator

        await mgr.disconnect(client=None)
        with pytest.raises(StopAsyncIteration):
            await gen.__anext__()

    async def test_connect_keepalive_on_timeout(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(smartphone_connection_module, "_KEEPALIVE_INTERVAL", 0.01)
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        gen = resp.body_iterator

        chunk = await gen.__anext__()
        assert chunk == ": keepalive\n\n"

    async def test_connect_cancelled_error_handled(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        gen = resp.body_iterator

        async def raise_cancelled():
            raise asyncio.CancelledError

        mgr._queue.get = raise_cancelled
        with pytest.raises(StopAsyncIteration):
            await gen.__anext__()


class TestDisconnect:
    async def test_disconnect_returns_empty_dict(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        result = await mgr.disconnect(client=None)
        assert result == {}

    async def test_disconnect_puts_sentinel_on_queue(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        await mgr.disconnect(client=None)
        assert mgr._queue.get_nowait() is None


class TestSendMessageToClient:
    async def test_send_message_queues_json(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        await mgr.send_message_to_client(client=None, message={"k": "v"})
        queued = mgr._queue.get_nowait()
        assert queued == json.dumps({"k": "v"})

    async def test_send_message_queue_full_is_swallowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        mgr = SmartphoneConnectionManager("conf-1")

        def raise_full(item):
            raise asyncio.QueueFull

        monkeypatch.setattr(mgr._queue, "put_nowait", raise_full)

        await mgr.send_message_to_client(client=None, message={"k": "v"})
