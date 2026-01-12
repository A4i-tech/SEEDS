from app.actions.base_actions.talk_action import TalkAction
from app.actions.base_actions.stream_action import StreamAction
from app.actions.base_actions.input_action import InputAction
from app.fsm.ivr_constants import audioGoingTobePlayedDialogUrl, pullMenuMainUrl, content_url, audioFinishedMessageUrl, \
    repeat_current_categories_key, previous_category_level_key

from app.fsm.state import State
from app.fsm.transition import Transition

from dotenv import load_dotenv

from app.utils.model_classes import Menu
from app.utils.model_classes import Option
from app.utils.pure_audio_model_classes import PureAudioData

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

        # Construct the content audio URL.
        # Here we use the content's _id and assume that the actual audio is a WAV file.
        # music_url = content_url + self.content_data.id + f"/{self.speechRate}.wav"
        music_url = self.content_data.audioContent[0].audioUrl
        actions.append(StreamAction(music_url, record_playback_time=True))

        # Add the "audio finished" dialog action.
        finished_url = audioFinishedMessageUrl.replace("{language}", self.language).replace("{speechRate}", self.speechRate)
        actions.append(StreamAction(pullMenuMainUrl + finished_url))

        # Add an input action to capture DTMF.
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

        # Create a final state.
        final_state_id = f"{state_id}-LastMenu"
        final_actions = []
        final_actions.append(StreamAction(pullMenuMainUrl + finished_url))
        final_actions.append(InputAction(type_=["dtmf"], eventApi="/input", timeOut=10))
        final_state = State(state_id=final_state_id, actions=final_actions)
        fsm.add_state(final_state)

        # Set up transitions for the final state.
        fsm.add_transition(Transition(source_state_id=state_id, dest_state_id=final_state_id, input="empty", actions=[]))
        fsm.add_transition(Transition(source_state_id=final_state_id, dest_state_id=fsm.end_state.id, input="empty", actions=[]))
        fsm.add_transition(Transition(source_state_id=final_state_id, dest_state_id=parent_block_state_id, input=previous_category_level_key, actions=[]))
        fsm.add_transition(Transition(source_state_id=final_state_id, dest_state_id=state_id, input=repeat_current_categories_key, actions=[]))

        return fsm