from __future__ import annotations

import os
import shutil
import socket
import subprocess
import time
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from nats.errors import TimeoutError as NatsTimeout

from app.providers.nats_queue import _NatsQueueHandle
from app.providers.service_bus import MessageType, QueueMessage


def _settings(
    suffix: str = "t",
    stream: str = "SEEDS_TEST",
    url: str = "nats://localhost:4222",
    max_retries: int = 3,
):
    return SimpleNamespace(
        nats_url=url,
        nats_stream=stream,
        nats_creds_file="",
        nats_ack_wait_seconds=30,
        azure_service_bus_max_retries=max_retries,
        call_webhook_queue_name=f"call_webhook_{suffix}",
        dtmf_input_queue_name=f"dtmf_input_{suffix}",
        call_event_queue_name=f"call_event_{suffix}",
        sync_jobs_queue_name=f"sync_jobs_{suffix}",
    )


class FakeRaw:
    def __init__(self, data: bytes, num_delivered: int = 1) -> None:
        self.data = data
        self.metadata = SimpleNamespace(
            num_delivered=num_delivered, sequence=SimpleNamespace(stream=5)
        )
        self.ack_sync = AsyncMock()
        self.nak = AsyncMock()
        self.term = AsyncMock()


def _body(message_id: str = "m1") -> bytes:
    return (
        QueueMessage(MessageType.CALL_EVENT, {"a": 1}, message_id=message_id)
        .to_json_string()
        .encode()
    )


def _handle(fetch=None) -> _NatsQueueHandle:
    handle = _NatsQueueHandle(_settings(), "call_event_t")
    handle._js = MagicMock(publish=AsyncMock())
    handle._sub = MagicMock(fetch=fetch or AsyncMock(return_value=[]))
    return handle


async def test_receive_maps_delivery_count_to_retry_count():
    handle = _handle(AsyncMock(return_value=[FakeRaw(_body(), num_delivered=3)]))
    (msg,) = await handle.receive()
    assert msg.retry_count == 2
    assert "m1" in handle._message_map


async def test_receive_timeout_returns_empty():
    handle = _handle(AsyncMock(side_effect=NatsTimeout()))
    assert await handle.receive() == []


async def test_unparseable_message_is_terminated_and_not_returned():
    bad = FakeRaw(b"not json")
    handle = _handle(AsyncMock(return_value=[bad, FakeRaw(_body("ok"))]))
    msgs = await handle.receive()
    bad.term.assert_awaited_once()
    handle._js.publish.assert_awaited_once_with(
        "call_event_t.dlq",
        b"not json",
        headers={"Nats-Msg-Id": "seq-5-dlq", "Dead-Letter-Reason": "ParseError"},
    )
    assert [m.message_id for m in msgs] == ["ok"]
    assert list(handle._message_map) == ["ok"]


async def test_complete_acks_and_abandon_naks():
    raws = [FakeRaw(_body("a")), FakeRaw(_body("b"))]
    handle = _handle(AsyncMock(return_value=raws))
    a, b = await handle.receive()
    assert await handle.complete(a) is True
    assert await handle.abandon(b) is True
    raws[0].ack_sync.assert_awaited_once()
    raws[1].nak.assert_awaited_once()
    assert await handle.complete(a) is False


async def test_dead_letter_publishes_to_dlq_then_terminates():
    raw = FakeRaw(_body())
    handle = _handle(AsyncMock(return_value=[raw]))
    (msg,) = await handle.receive()
    assert await handle.dead_letter(msg, "bad payload") is True
    handle._js.publish.assert_awaited_once_with(
        "call_event_t.dlq",
        raw.data,
        headers={"Nats-Msg-Id": "m1-dlq", "Dead-Letter-Reason": "bad payload"},
    )
    raw.term.assert_awaited_once()
    assert await handle.dead_letter(msg, "again") is False


async def test_send_sets_dedup_header():
    handle = _handle()
    msg = QueueMessage(MessageType.CALL_EVENT, {"a": 1}, message_id="dup-1")
    assert await handle.send(msg) is True
    assert handle._js.publish.await_args.kwargs["headers"] == {"Nats-Msg-Id": "dup-1"}


async def test_message_past_max_retries_is_dead_lettered_not_returned():
    raw = FakeRaw(_body(), num_delivered=4)
    handle = _handle(AsyncMock(return_value=[raw]))
    assert await handle.receive() == []
    handle._js.publish.assert_awaited_once_with(
        "call_event_t.dlq",
        raw.data,
        headers={"Nats-Msg-Id": "m1-dlq", "Dead-Letter-Reason": "MaxDeliveryCountExceeded"},
    )
    raw.term.assert_awaited_once()
    assert handle._message_map == {}


async def test_initialize_rejects_old_server():
    nc = MagicMock(connected_server_version=SimpleNamespace(major=2, minor=9, patch=4))
    handle = _NatsQueueHandle(_settings(), "call_event_t")
    with (
        patch("app.providers.nats_queue.nats.connect", new=AsyncMock(return_value=nc)),
        pytest.raises(RuntimeError, match=r"2\.9\.4.*2\.10"),
    ):
        await handle.initialize()


@pytest.fixture(scope="module")
def nats_url(tmp_path_factory):
    url = os.environ.get("NATS_TEST_URL")
    if url:
        yield url
        return
    binary = shutil.which("nats-server")
    if not binary:
        message = "No NATS server: set NATS_TEST_URL or put nats-server on PATH"
        if os.environ.get("CI"):
            pytest.fail(message)
        pytest.skip(message)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    store = tmp_path_factory.mktemp("jetstream")
    proc = subprocess.Popen(
        [binary, "-js", "-a", "127.0.0.1", "-p", str(port), "-sd", str(store)]
    )
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.1)
        else:
            pytest.fail("nats-server did not open its port within 10 seconds")
        yield f"nats://127.0.0.1:{port}"
    finally:
        proc.terminate()
        proc.wait(timeout=10)


@pytest.fixture
async def live(nats_url):
    suffix = uuid.uuid4().hex[:8]
    settings = _settings(suffix, stream=f"T_{suffix}", url=nats_url, max_retries=2)
    handle = _NatsQueueHandle(settings, settings.call_event_queue_name)
    try:
        await handle.initialize()
        yield handle
        await handle._js.delete_stream(settings.nats_stream)
    finally:
        await handle.close()


async def test_live_send_receive_complete_roundtrip(live):
    assert (
        await live.send(QueueMessage(MessageType.CALL_EVENT, {"k": "v"}, message_id="r1")) is True
    )
    (msg,) = await live.receive(max_count=5, wait_seconds=3)
    assert msg.payload == {"k": "v"}
    assert msg.retry_count == 0
    assert await live.complete(msg) is True
    assert await live.receive(max_count=5, wait_seconds=1) == []


async def test_live_duplicate_message_id_is_delivered_once(live):
    for _ in range(2):
        await live.send(QueueMessage(MessageType.CALL_EVENT, {}, message_id="same"))
    msgs = await live.receive(max_count=5, wait_seconds=3)
    assert len(msgs) == 1


async def test_live_abandon_redelivers_with_retry_count(live):
    await live.send(QueueMessage(MessageType.CALL_EVENT, {}, message_id="r2"))
    (first,) = await live.receive(wait_seconds=3)
    await live.abandon(first)
    (second,) = await live.receive(wait_seconds=3)
    assert second.retry_count == 1


async def test_live_dead_letter_lands_on_dlq_subject(live):
    await live.send(QueueMessage(MessageType.CALL_EVENT, {}, message_id="r3"))
    (msg,) = await live.receive(wait_seconds=3)
    assert await live.dead_letter(msg, "poison") is True
    dlq = await live._js.get_last_msg(live.settings.nats_stream, live.dlq_subject)
    assert dlq.headers["Dead-Letter-Reason"] == "poison"
    assert await live.receive(wait_seconds=1) == []


async def test_live_message_past_max_retries_ends_on_dlq(live):
    await live.send(QueueMessage(MessageType.CALL_EVENT, {}, message_id="r4"))
    for _ in range(live.settings.azure_service_bus_max_retries):
        (msg,) = await live.receive(wait_seconds=3)
        await live.abandon(msg)
    assert await live.receive(wait_seconds=3) == []
    dlq = await live._js.get_last_msg(live.settings.nats_stream, live.dlq_subject)
    assert dlq.headers["Dead-Letter-Reason"] == "MaxDeliveryCountExceeded"
