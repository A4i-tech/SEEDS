from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services.fsm.fsm import FSM
from app.services.fsm.instantiation.pure_audio import PureAudio
from app.services.fsm.state import State


def _make_content_data() -> MagicMock:
    data = MagicMock()
    data.language = "en"
    data.title.local = "Local Title"
    data.title.english = "English Title"
    data.audio_content = []  # skip the WebSocket/duration branch entirely
    data.school_id = ""
    return data


def _build_fsm_with_playback_state():
    with patch("app.services.fsm.instantiation.pure_audio.get_settings") as mock_settings:
        mock_settings.return_value.azure_storage_account_name = ""
        mock_settings.return_value.websocket_service_url = "ws://example.com"

        with patch("app.services.fsm.fsm.get_settings") as mock_fsm_settings:
            mock_fsm_settings.return_value.azure_storage_account_name = ""
            fsm = FSM(fsm_id="test")

        parent_state_id = "TI0"
        fsm.add_state(State(state_id=parent_state_id, actions=[]))

        pure_audio = PureAudio(_make_content_data(), speech_rate="1.0")
        pure_audio.generate_state(
            fsm,
            prefix_state_id="TI0-Op0(Title)-",
            parent_block_state_id=parent_state_id,
            key_chosen=1,
            level=3,
        )

    return fsm, "TI0-Op0(Title)"


class TestPureAudioRepeatKept:
    def test_repeat_option_in_menu(self) -> None:
        fsm, state_id = _build_fsm_with_playback_state()

        state = fsm.states[state_id]
        option_by_key = {o.key: o.value for o in state.menu.options}
        assert option_by_key["8"] == "repeat"

    def test_key_8_self_loop_transition(self) -> None:
        fsm, state_id = _build_fsm_with_playback_state()

        state = fsm.states[state_id]
        assert "8" in state.transition_map
        assert state.transition_map["8"].dest_state_id == state_id

    def test_exit_key_9_unaffected(self) -> None:
        fsm, state_id = _build_fsm_with_playback_state()

        state = fsm.states[state_id]
        assert "9" in state.transition_map
        assert state.transition_map["9"].dest_state_id == "TI0"
        option_by_key = {o.key: o.value for o in state.menu.options}
        assert option_by_key["9"] == "exit"
