"""SSE connection manager for the teacher smartphone app."""

from __future__ import annotations

import asyncio
import json
import logging

import pytest

from app.providers import smartphone_connection
from app.providers.smartphone_connection import (
    SmartphoneConnectionManager,
    SmartphoneConnectionManagerFactory,
)

CLIENT = object()


async def _drain(response, count: int) -> list[str]:
    stream = response.body_iterator
    return [await asyncio.wait_for(anext(stream), timeout=2) for _ in range(count)]


@pytest.fixture
def manager():
    return SmartphoneConnectionManager("conf-1")


@pytest.mark.asyncio
async def test_connect_returns_an_unbuffered_sse_response(manager) -> None:
    response = await manager.connect(CLIENT)
    assert response.media_type == "text/event-stream"
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-accel-buffering"] == "no"


@pytest.mark.asyncio
async def test_queued_messages_are_streamed_as_sse_data_frames(manager) -> None:
    response = await manager.connect(CLIENT)
    await manager.send_message_to_client(CLIENT, {"event": "play"})
    await manager.send_message_to_client(CLIENT, {"event": "pause"})

    frames = await _drain(response, 2)
    assert frames == ['data: {"event": "play"}\n\n', 'data: {"event": "pause"}\n\n']
    assert json.loads(frames[0].removeprefix("data: ").strip()) == {"event": "play"}


@pytest.mark.asyncio
async def test_an_idle_stream_emits_a_keepalive_comment(manager, monkeypatch) -> None:
    monkeypatch.setattr(smartphone_connection, "_KEEPALIVE_INTERVAL", 0.01)
    response = await manager.connect(CLIENT)
    assert await _drain(response, 1) == [": keepalive\n\n"]


@pytest.mark.asyncio
async def test_disconnect_ends_the_stream(manager) -> None:
    response = await manager.connect(CLIENT)
    assert await manager.disconnect(CLIENT) == {}

    with pytest.raises(StopAsyncIteration):
        await asyncio.wait_for(anext(response.body_iterator), timeout=2)


@pytest.mark.asyncio
async def test_messages_queued_before_the_sentinel_still_get_delivered(manager) -> None:
    response = await manager.connect(CLIENT)
    await manager.send_message_to_client(CLIENT, {"event": "play"})
    await manager.disconnect(CLIENT)

    assert await _drain(response, 1) == ['data: {"event": "play"}\n\n']
    with pytest.raises(StopAsyncIteration):
        await asyncio.wait_for(anext(response.body_iterator), timeout=2)


@pytest.mark.asyncio
async def test_a_cancelled_stream_shuts_down_quietly(manager) -> None:
    response = await manager.connect(CLIENT)
    await manager.send_message_to_client(CLIENT, {"event": "play"})
    await _drain(response, 1)

    with pytest.raises(StopAsyncIteration):
        await response.body_iterator.athrow(asyncio.CancelledError)


@pytest.mark.asyncio
async def test_a_full_queue_drops_the_message_instead_of_raising(manager, caplog) -> None:
    manager._queue = asyncio.Queue(maxsize=1)
    await manager.send_message_to_client(CLIENT, {"event": "first"})
    await manager.send_message_to_client(CLIENT, {"event": "dropped"})

    assert manager._queue.qsize() == 1
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1, "a silently dropped message is worse than a noisy one"
    assert "conf-1" in warnings[0].getMessage()


def test_the_factory_makes_one_manager_per_conference() -> None:
    factory = SmartphoneConnectionManagerFactory()
    first, second = factory.create("conf-1"), factory.create("conf-2")
    assert (first.conf_id, second.conf_id) == ("conf-1", "conf-2")
    assert first is not second
