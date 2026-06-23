"""PureAudio FSM builder — generates playback states for audio content.

Ported from IVRv2/app/fsm/pureAudio.py — import paths updated, logic unchanged.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import urlencode

from app.platform.settings import get_settings
from app.providers.vonage_actions.connect_action import VonageConnectAction
from app.providers.vonage_actions.input_action import InputAction
from app.providers.vonage_actions.stream_action import StreamAction
from app.providers.vonage_actions.talk_action import TalkAction
from app.services.fsm.instantiation.ivr_constants import (
    audioGoingTobePlayedDialogUrl,
    get_pull_menu_main_url,
    previous_category_level_key,
    repeat_current_categories_key,
)
from app.services.fsm.operations.daily_limit_pre_operation import DailyLimitPreOperation
from app.services.fsm.state import State
from app.services.fsm.transition import Transition
from app.services.fsm.utils import get_blob_language_name, get_vonage_language_code

if TYPE_CHECKING:
    from app.services.fsm.fsm import FSM


class _Option:
    def __init__(self, key: int, value: str) -> None:
        self.key = key
        self.value = value


class _Menu:
    def __init__(self, description: str, options: list, level: int, language: str = "") -> None:
        self.description = description
        self.options = options
        self.level = level
        self.language = language

    def dict(self, **kwargs) -> dict:  # noqa: ANN001
        return {
            "description": self.description,
            "options": [{"key": o.key, "value": o.value} for o in (self.options or [])],
            "level": self.level,
            "language": self.language,
        }


class PureAudio:
    """Generates IVR states for pure audio (non-quiz) content playback."""

    def __init__(self, content_data, speech_rate: str) -> None:  # noqa: ANN001
        self.content_data = content_data
        self.speechRate = speech_rate
        self.language = content_data.language

    def generate_state(
        self,
        fsm: FSM,
        prefix_state_id: str,
        parent_block_state_id: str,
        key_chosen: int,
        level: int,
    ) -> FSM:

        settings = get_settings()
        pullMenuMainUrl = get_pull_menu_main_url()
        state_id = prefix_state_id.rstrip("-")
        actions = []

        # "Going to be played" dialog
        blob_lang = get_blob_language_name(self.language)
        going_to_play_url = (
            audioGoingTobePlayedDialogUrl
            .replace("{language}", blob_lang)
            .replace("{speechRate}", self.speechRate)
        )
        actions.append(StreamAction(pullMenuMainUrl + going_to_play_url))

        # Duration + speed + pause announcements
        if self.content_data.audioContent:
            vonage_language = get_vonage_language_code(self.language)
            duration = self.content_data.audioContent[0].durationSeconds

            if duration:
                from app.services.fsm.instantiation.duration_announcement import (  # noqa: PLC0415
                    format_duration_announcement,
                )
                duration_text = format_duration_announcement(duration, self.language)
                if duration_text:
                    actions.append(
                        TalkAction(
                            text=duration_text, level=1.0, bargeIn=True, loop=1, language=vonage_language
                        )
                    )

            from app.services.fsm.instantiation.speed_control import (
                get_speed_instruction,  # noqa: PLC0415
            )
            speed_instruction = get_speed_instruction(self.language)
            actions.append(
                TalkAction(text=speed_instruction, level=1.0, bargeIn=True, loop=1, language=vonage_language)
            )

            from app.services.fsm.instantiation.pause_announcement import (
                get_pause_instruction,  # noqa: PLC0415
            )
            pause_instruction = get_pause_instruction(self.language)
            actions.append(
                TalkAction(text=pause_instruction, level=1.0, bargeIn=True, loop=1, language=vonage_language)
            )

            # WebSocket connect action for streaming
            audio_url = self.content_data.audioContent[0].audioUrl
            query_params = urlencode({"id": state_id, "audio_url": audio_url, "speed": "1.0"})
            websocket_url = f"{settings.websocket_service_url}/?{query_params}"
            actions.append(
                VonageConnectAction(websocket_uri=websocket_url, content_type="audio/l16;rate=8000")
            )

        # DTMF capture after WebSocket leg
        actions.append(InputAction(type_=["dtmf"], eventApi="/dtmf", timeOut=10))

        options = [
            _Option(key=8, value="repeat"),
            _Option(key=9, value="exit"),
            _Option(key=0, value="next (instructions to exit)"),
        ]
        description = (
            f"{self.content_data.title.local} - {self.content_data.title.english} Audio Playing"
        )
        menu = _Menu(
            description=description, options=options, level=level, language=self.language
        )

        # Daily limit pre-operation
        daily_limit_pre_op = None
        if (
            self.content_data.audioContent
            and self.content_data.audioContent[0].durationSeconds
        ):
            daily_limit_pre_op = DailyLimitPreOperation(
                duration_seconds=self.content_data.audioContent[0].durationSeconds,
                language=self.language,
                school_id=getattr(self.content_data, "school_id", ""),
            )

        playback_state = State(
            state_id=state_id, actions=actions, menu=menu, pre_operation=daily_limit_pre_op
        )
        fsm.add_state(playback_state)

        # Transitions from parent block
        fsm.add_transition(
            Transition(
                source_state_id=parent_block_state_id,
                dest_state_id=state_id,
                input=str(key_chosen),
                actions=[],
            )
        )
        fsm.add_transition(
            Transition(
                source_state_id=state_id,
                dest_state_id=parent_block_state_id,
                input=previous_category_level_key,
                actions=[],
            )
        )
        fsm.add_transition(
            Transition(
                source_state_id=state_id,
                dest_state_id=state_id,
                input=repeat_current_categories_key,
                actions=[],
            )
        )
        return fsm
