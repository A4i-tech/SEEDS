import os
import sys
from types import SimpleNamespace

import pytest

os.environ["STORAGE_ACCOUNT_NAME"] = "test"
os.environ["ENVIRONMENT"] = "development"
os.environ["APPLICATIONINSIGHTS_CONNECTION_STRING"] = (
    "InstrumentationKey=test-key;IngestionEndpoint=https://test.com/"
)

sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/../../")

from app.models.participant import Participant, Role
from app.services.smartphone_connection_manager.sse_connection_manager import (
    SSEConnectionManager,
)


@pytest.mark.asyncio
async def test_disconnect_does_not_raise_when_stream_is_active():
    manager = SSEConnectionManager()
    client = Participant(name="Teacher", phone_number="911234567890", role=Role.TEACHER)

    response = await manager.connect(client)
    stream = response.body_iterator

    await manager.disconnect(client)

    with pytest.raises(StopAsyncIteration):
        await anext(stream)

    assert client.phone_number not in manager.active_connections


@pytest.mark.asyncio
async def test_send_message_emits_sse_payload():
    manager = SSEConnectionManager()
    client = Participant(name="Teacher", phone_number="911234567891", role=Role.TEACHER)

    response = await manager.connect(client)
    stream = response.body_iterator

    await manager.send_message_to_client(client, {"status": "connected"})
    chunk = await anext(stream)

    assert chunk == 'data: {"status": "connected"}\n\n'

    await manager.disconnect(client)
    with pytest.raises(StopAsyncIteration):
        await anext(stream)
