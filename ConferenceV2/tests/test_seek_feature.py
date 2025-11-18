import pytest
from pydantic import ValidationError
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch

from app.schemas.conference_schemas import SeekAudioRequest
from app.services.confevents.seek_content_event import SeekContentEvent
from app.services.conference_call import ConferenceCall
from app.models.ws_service_message import MessageType


def test_seek_audio_request_accepts_in_range_values():
    req = SeekAudioRequest(delta_seconds=120)
    assert req.delta_seconds == 120


def test_seek_audio_request_rejects_out_of_range_values():
    with pytest.raises(ValidationError):
        SeekAudioRequest(delta_seconds=700)


@pytest.mark.asyncio
async def test_seek_content_event_dispatches_seek_message():
    conference = SimpleNamespace()
    conference.conf_id = "conf-123"
    conference.state = SimpleNamespace(
        action_history=[],
        teacher_phone_number="+15550000000",
    )
    update_state_mock = AsyncMock()
    conference.update_state = update_state_mock
    conference = cast(ConferenceCall, conference)

    ws_mock = SimpleNamespace(send_message=AsyncMock())

    with patch(
        "app.services.confevents.seek_content_event.WebsocketService",
        return_value=ws_mock,
    ):
        event = SeekContentEvent(conf_call=conference, delta_seconds=42)
        await event.execute_event()

    ws_mock.send_message.assert_awaited_once()
    message = ws_mock.send_message.await_args[0][0]
    assert message.websocket_id == "conf-123"
    assert message.type == MessageType.SEEK_AUDIO
    assert message.message == {"deltaSeconds": 42}

    assert len(conference.state.action_history) == 1
    assert conference.state.action_history[0].metadata == {"seek_delta_seconds": 42}
    assert update_state_mock.await_count == 1
