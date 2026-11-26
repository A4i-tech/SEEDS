"""Coverage for app.providers.smartphone_connection."""

from __future__ import annotations

import asyncio
import json
import logging

import pytest

import app.providers.smartphone_connection as smartphone_connection_module
from app.providers.smartphone_connection import (
    SmartphoneConnectionManager,
    SmartphoneConnectionManagerFactory,
)


class TestSmartphoneConnectionManagerFactory:
    async def test_create_returns_independent_instances(self) -> None:
        factory = SmartphoneConnectionManagerFactory()
        mgr1 = factory.create("conf-1")
        mgr2 = factory.create("conf-2")
        assert isinstance(mgr1, SmartphoneConnectionManager)
        assert mgr1.conf_id == "conf-1"
        assert mgr2.conf_id == "conf-2"
        assert mgr1 is not mgr2

        resp1 = await mgr1.connect(client=None)
        gen1 = resp1.body_iterator
        await mgr1.send_message_to_client(client=None, message={"a": 1})
        chunk = await gen1.__anext__()
        assert chunk == f'data: {json.dumps({"a": 1})}\n\n'


class TestConnect:
    async def test_connect_returns_streaming_response(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        assert resp.media_type == "text/event-stream"
        assert resp.headers["Cache-Control"] == "no-cache"
        assert resp.headers["X-Accel-Buffering"] == "no"

    @pytest.mark.parametrize("message", [{"a": 1}, [1, 2, 3]])
    async def test_connect_yields_message_delivery(self, message: dict | list) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        gen = resp.body_iterator

        await mgr.send_message_to_client(client=None, message=message)
        chunk = await gen.__anext__()
        assert chunk == f"data: {json.dumps(message)}\n\n"

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

    async def test_connect_cancelled_error_propagates(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        gen = resp.body_iterator

        task = asyncio.ensure_future(gen.__anext__())
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task


class TestDisconnect:
    async def test_disconnect_returns_empty_dict(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        result = await mgr.disconnect(client=None)
        assert result == {}

    async def test_disconnect_puts_sentinel_on_queue(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        gen = resp.body_iterator

        await mgr.disconnect(client=None)

        with pytest.raises(StopAsyncIteration):
            await gen.__anext__()


class TestSendMessageToClient:
    async def test_send_message_queues_json(self) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        resp = await mgr.connect(client=None)
        gen = resp.body_iterator

        await mgr.send_message_to_client(client=None, message={"k": "v"})
        chunk = await gen.__anext__()

        assert chunk == f'data: {json.dumps({"k": "v"})}\n\n'

    async def test_send_message_queue_full_drops_oldest(self, caplog: pytest.LogCaptureFixture) -> None:
        mgr = SmartphoneConnectionManager("conf-1")
        for n in range(smartphone_connection_module._MAX_QUEUE):
            await mgr.send_message_to_client(client=None, message={"n": n})

        with caplog.at_level(logging.WARNING, logger="app.providers.smartphone_connection"):
            await mgr.send_message_to_client(client=None, message={"n": "new"})

        queued = [mgr._queue.get_nowait() for _ in range(mgr._queue.qsize())]
        assert len(queued) == smartphone_connection_module._MAX_QUEUE
        assert queued[0] == json.dumps({"n": 1})
        assert queued[-1] == json.dumps({"n": "new"})
        assert "smartphone_connection: queue full for conf_id=conf-1, dropped oldest" in caplog.text
