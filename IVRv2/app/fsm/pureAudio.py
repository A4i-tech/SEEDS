from app.actions.base_actions.talk_action import TalkAction
from app.actions.base_actions.stream_action import StreamAction
from app.actions.base_actions.input_action import InputAction
from app.actions.vonage_actions.vonage_connect_action import VonageConnectAction
from app.fsm.ivr_constants import audioGoingTobePlayedDialogUrl, pullMenuMainUrl, \
    repeat_current_categories_key, previous_category_level_key

from app.fsm.state import State
from app.fsm.transition import Transition

from dotenv import load_dotenv

from app.utils.model_classes import Menu
from app.utils.model_classes import Option
from app.utils.pure_audio_model_classes import PureAudioData
from app.utils.duration_announcement import format_duration_announcement
from app.utils.ivr_utils import get_vonage_language_code
from app.settings import settings
from urllib.parse import urlencode

load_dotenv()

class PureAudio:
    def __init__(self, content_data: PureAudioData, speechRate: str):
        """
        Initializes a PureAudio instance.

        :param content_data: An instance of AudioExperience containing the content details.
        :param speechRate: The speech rate string (e.g., "1.0").
        """
        self.content_data = content_data
        self.speechRate = speechRate
        # Use the language from the content; default to "kannada" if not provided.
        self.language = content_data.language

    def generate_state(self, fsm, prefix_state_id: str, parent_block_state_id: str, key_chosen: int, level: int):
        """
        Generates the pure audio playback state (and a final state) for non-quiz content,
        then adds them to the FSM.

        :param fsm: The FSM instance.
        :param prefix_state_id: The base state id for this content.
        :param parent_block_state_id: The state id to which we return (the parent's block id).
        :param key_chosen: The key pressed to select this content.
        :param level: The current menu level (used in state menus).
        """
        # Build the playback state id by removing any trailing hyphen.
        state_id = prefix_state_id.rstrip('-')
        actions = []

        # Build and add a "going to be played" dialog action.
        going_to_play_url = audioGoingTobePlayedDialogUrl.replace("{language}", self.language).replace("{speechRate}", self.speechRate)
        actions.append(StreamAction(pullMenuMainUrl + going_to_play_url))

        # Add duration announcement if available
        if self.content_data.audioContent:
            duration = self.content_data.audioContent[0].durationSeconds
            if duration:
                duration_text = format_duration_announcement(duration, self.language)
                if duration_text:
                    vonage_language = get_vonage_language_code(self.language)
                    actions.append(TalkAction(text=duration_text, level=1.0, bargeIn=True, loop=1, language=vonage_language))

            # Connect to WebSocket for audio streaming
            audio_url = self.content_data.audioContent[0].audioUrl
            query_params = urlencode({"id": state_id, "audio_url": audio_url, "speed": "1.0"})
            websocket_url = f"{settings.websocket_service_url}/?{query_params}"
            actions.append(VonageConnectAction(websocket_uri=websocket_url, content_type="audio/l16;rate=8000"))

        # Keep DTMF capture available after websocket leg so users can navigate (e.g. 9 -> previous menu).
        actions.append(InputAction(type_=["dtmf"], eventApi="/input", timeOut=10))

        # Build a simple menu with options.
        options = [
            Option(key=8, value="repeat"),
            Option(key=9, value="exit"),
            Option(key=0, value="next (instructions to exit)")
        ]
        description = f"{self.content_data.title.local} - {self.content_data.title.english} Audio Playing"
        menu = Menu(description=description, options=options, level=level)

        playback_state = State(state_id=state_id, actions=actions, menu=menu)
        fsm.add_state(playback_state)

        # Add transitions from the parent block to the playback state.
        fsm.add_transition(Transition(source_state_id=parent_block_state_id, dest_state_id=state_id, input=str(key_chosen), actions=[]))
        fsm.add_transition(Transition(source_state_id=state_id, dest_state_id=parent_block_state_id, input=previous_category_level_key, actions=[]))
        fsm.add_transition(Transition(source_state_id=state_id, dest_state_id=state_id, input=repeat_current_categories_key, actions=[]))

        return fsm
