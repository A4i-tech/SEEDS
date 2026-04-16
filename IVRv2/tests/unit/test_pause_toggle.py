"""
Tests for pause/resume toggle logic in the /input (dtmf) endpoint.

Covers:
- playing → paused transition (is_paused=False → press 0)
- paused → playing transition (is_paused=True → press 0)
- Default state (no experience_data) treated as playing
- NCCO response shape: talk + input actions returned
- Key 0 NOT intercepted when state has no WebSocket connection
"""
import sys
import os
import json
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.append(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

from app.main import dtmf
from app.actions.vonage_actions.vonage_connect_action import VonageConnectAction
from app.utils.pause_announcement import PAUSED_ANNOUNCEMENTS, RESUMING_ANNOUNCEMENTS

CONV_ID = "test-conv-uuid"
FSM_ID = "test-fsm-id"
STATE_ID = "stream-state-1"
PHONE = "+1234567890"


def _call_doc(is_paused=None):
    """Minimal dict parseable as IVRCallStateMongoDoc."""
    experience_data = {}
    if is_paused is not None:
        experience_data["is_paused"] = is_paused
    return {
        "_id": CONV_ID,
        "phone_number": PHONE,
        "fsm_id": FSM_ID,
        "current_state_id": STATE_ID,
        "created_at": datetime.now().isoformat(),
        "experience_data": experience_data,
    }


def _make_request(digits, timed_out=False):
    """Mock FastAPI Request with JSON payload."""
    req = MagicMock()
    req.json = AsyncMock(return_value={
        "dtmf": {"digits": digits, "timed_out": timed_out},
        "conversation_uuid": CONV_ID,
    })
    return req


def _make_streaming_state():
    """FSM state with a VonageConnectAction so is_streaming=True."""
    state = MagicMock()
    state.actions = [VonageConnectAction(websocket_uri="ws://test-ws")]
    state.menu = None
    return state


def _make_non_streaming_state():
    """FSM state with NO VonageConnectAction so is_streaming=False."""
    state = MagicMock()
    state.actions = []
    return state


def _app_state(doc, streaming=True):
    """Mock app state wired for a single call doc."""
    mock_state = MagicMock()

    fsm_state = _make_streaming_state() if streaming else _make_non_streaming_state()

    mock_fsm = MagicMock()
    mock_fsm.states = {STATE_ID: fsm_state}
    # get_state() is called inside the pause block to resolve language;
    # return a state with no menu so language falls back to settings default
    lang_state = MagicMock()
    lang_state.menu = None
    mock_fsm.get_state.return_value = lang_state
    mock_fsm.get_next_actions = AsyncMock(return_value=([], STATE_ID))

    mock_state.fsm = {FSM_ID: mock_fsm}

    mock_mongo = MagicMock()
    mock_mongo.find_by_id = AsyncMock(return_value=doc)
    mock_mongo.update_document = AsyncMock()
    mock_state.ongoing_fsm_mongo = mock_mongo

    return mock_state


def _parse_ncco(response):
    """Extract NCCO list from JSONResponse."""
    return json.loads(response.body)


@pytest.mark.asyncio
@patch("app.main.get_websocket_service")
@patch("app.main.get_app_state")
async def test_playing_to_paused_calls_pause_audio(mock_state, mock_ws_svc):
    """press 0 while playing → pause_audio called once."""
    mock_state.return_value = _app_state(_call_doc(is_paused=False))
    mock_ws = AsyncMock()
    mock_ws_svc.return_value = mock_ws

    await dtmf(_make_request("0"))

    mock_ws.pause_audio.assert_called_once_with(CONV_ID)
    mock_ws.resume_audio.assert_not_called()


@pytest.mark.asyncio
@patch("app.main.get_websocket_service")
@patch("app.main.get_app_state")
async def test_playing_to_paused_response_contains_paused_text(mock_state, mock_ws_svc):
    """Paused announcement included in NCCO talk action."""
    mock_state.return_value = _app_state(_call_doc(is_paused=False))
    mock_ws_svc.return_value = AsyncMock()

    response = await dtmf(_make_request("0"))
    ncco = _parse_ncco(response)

    talk = next((a for a in ncco if a.get("action") == "talk"), None)
    assert talk is not None
    assert talk["text"] in PAUSED_ANNOUNCEMENTS.values()


@pytest.mark.asyncio
@patch("app.main.get_websocket_service")
@patch("app.main.get_app_state")
async def test_paused_to_playing_calls_resume_audio(mock_state, mock_ws_svc):
    """press 0 while paused → resume_audio called once."""
    mock_state.return_value = _app_state(_call_doc(is_paused=True))
    mock_ws = AsyncMock()
    mock_ws_svc.return_value = mock_ws

    await dtmf(_make_request("0"))

    mock_ws.resume_audio.assert_called_once_with(CONV_ID)
    mock_ws.pause_audio.assert_not_called()


@pytest.mark.asyncio
@patch("app.main.get_websocket_service")
@patch("app.main.get_app_state")
async def test_paused_to_playing_response_contains_resuming_text(mock_state, mock_ws_svc):
    """Resuming announcement included in NCCO talk action."""
    mock_state.return_value = _app_state(_call_doc(is_paused=True))
    mock_ws_svc.return_value = AsyncMock()

    response = await dtmf(_make_request("0"))
    ncco = _parse_ncco(response)

    talk = next((a for a in ncco if a.get("action") == "talk"), None)
    assert talk is not None
    assert talk["text"] in RESUMING_ANNOUNCEMENTS.values()


@pytest.mark.asyncio
@patch("app.main.get_websocket_service")
@patch("app.main.get_app_state")
async def test_empty_experience_data_defaults_to_playing(mock_state, mock_ws_svc):
    """No is_paused key → treated as playing → pause on press 0."""
    mock_state.return_value = _app_state(_call_doc())  # empty experience_data
    mock_ws = AsyncMock()
    mock_ws_svc.return_value = mock_ws

    await dtmf(_make_request("0"))

    mock_ws.pause_audio.assert_called_once_with(CONV_ID)


@pytest.mark.asyncio
@patch("app.main.get_websocket_service")
@patch("app.main.get_app_state")
async def test_toggle_response_includes_input_action(mock_state, mock_ws_svc):
    """Toggle NCCO must include an InputAction to keep listening for next key."""
    mock_state.return_value = _app_state(_call_doc(is_paused=False))
    mock_ws_svc.return_value = AsyncMock()

    response = await dtmf(_make_request("0"))
    ncco = _parse_ncco(response)

    assert any(a.get("action") == "input" for a in ncco), (
        "Expected an input action in NCCO to continue listening"
    )


@pytest.mark.asyncio
@patch("app.main.get_websocket_service")
@patch("app.main.get_app_state")
async def test_key_0_not_intercepted_when_not_streaming(mock_state, mock_ws_svc):
    """Key 0 passes through to FSM when state has no WebSocket connection."""
    mock_state.return_value = _app_state(_call_doc(is_paused=False), streaming=False)
    mock_ws = AsyncMock()
    mock_ws_svc.return_value = mock_ws

    await dtmf(_make_request("0"))

    mock_ws.pause_audio.assert_not_called()
    mock_ws.resume_audio.assert_not_called()
    # FSM get_next_actions should have been called instead
    mock_state.return_value.fsm[FSM_ID].get_next_actions.assert_called_once()
