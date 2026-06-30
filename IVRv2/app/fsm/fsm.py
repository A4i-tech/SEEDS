from app.settings import settings
from app.utils.daily_limit import get_daily_usage, increment_daily_usage, get_ist_date_string
from app.utils.duration_announcement import get_daily_limit_announcement
from app.utils.ivr_utils import get_vonage_language_code
from datetime import datetime
from typing import List, Tuple
from app.actions.base_actions.stream_action import StreamAction
from app.actions.base_actions.input_action import InputAction
from app.actions.vonage_actions.vonage_connect_action import VonageConnectAction
from app.fsm.transition import Transition
from app.base_classes.action import Action
from app.actions.base_actions.talk_action import TalkAction
from app.utils.model_classes import IVRCallStateMongoDoc, IVRfsmDoc
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from app.services.websocket_service import get_websocket_service
import asyncio

storage_account_name = settings.storage_account_name
if not storage_account_name:
    raise ValueError("STORAGE_ACCOUNT_NAME environment variable is not set.")


class FSM:
    STORAGE_ACCOUNT_BASE_URL = (
        f"https://{storage_account_name}.blob.core.windows.net/pull-model-menus/"
    )
    NO_OPTION_CHOSEN_AUDIO_URL = f"{STORAGE_ACCOUNT_BASE_URL}chosenNoOptionDialog/kannada/Sorry,%20you%20have%20not%20chosen%20any%20option/1.0.mp3"
    WRONG_INPUT_AUDIO_URL = f"{STORAGE_ACCOUNT_BASE_URL}chosenWrongOptionDialog/kannada/Sorry,%20you%20have%20chosen%20the%20wrong%20option/1.0.mp3"

    def __init__(self, fsm_id: str):
        from app.fsm.state import State

        """
        Initializes a new instance of the FSM class.

        Args:
        fsm_id (str): A unique identifier for the FSM instance. 

        Attributes:
        states (dict[str, State]): A dictionary mapping state IDs to State objects.
        init_state_id (str): The initial state ID of the FSM.
        invalid_input_error_actions (list[Action]): Actions to perform when an invalid input is received.
        empty_input_error_actions (list[Action]): Actions to perform when no input is received.
        end_state (State): A predefined end state with a termination action.
        """
        self.fsm_id = fsm_id
        self.states: dict[str, State] = {}
        self.init_state_id = "LA0"
        self.invalid_input_error_actions: List[Action] = [
            StreamAction(self.WRONG_INPUT_AUDIO_URL)
        ]
        self.empty_input_error_actions: List[Action] = [
            StreamAction(self.NO_OPTION_CHOSEN_AUDIO_URL)
        ]

    def serialize(self) -> IVRfsmDoc:
        states = [state.serialize() for state in self.states.values()]
        transitions = []
        for state in self.states.values():
            print(state.serialize_transitions(), type(state.serialize_transitions()))
            transitions.extend(state.serialize_transitions())

        return IVRfsmDoc(
            _id=self.fsm_id,
            init_state_id=self.init_state_id,
            states=states,
            transitions=transitions,
            created_at=int(datetime.now().timestamp()),
        )

    @staticmethod
    def deserialize(data: IVRfsmDoc):
        from fsm.state import State

        fsm = FSM(data.id)
        for state_json in data.states:
            state_obj = State.from_json(state_json)
            fsm.add_state(state_obj)

        print("Init State ID", data.init_state_id)
        fsm.set_init_state_id(data.init_state_id)

        for transition_json in data.transitions:
            transition_obj = Transition.from_json(transition_json)
            fsm.add_transition(transition_obj)

        return fsm

    def get_state(self, state_id: str):
        if state_id in self.states:
            return self.states[state_id]
        return None

    def set_end_state(self, state):
        self.end_state = state
        self.add_state(state)

    def add_state(self, state):
        """
        Adds a state to the FSM if it does not already exist.

        Args:
        state (State): The state to be added to the FSM.

        Raises:
        ValueError: If a state with the same ID already exists in the FSM.
        """
        if state.id in self.states:
            raise ValueError(f"State with id {state.id} already exists")
        self.states[state.id] = state

    def set_init_state_id(self, state_id: str):
        """
        Sets the initial state of the FSM.

        Args:
        state_id (str): The ID of the state to set as initial.

        Raises:
        ValueError: If the specified state ID does not exist in the FSM.
        """
        if state_id not in self.states:
            raise ValueError(
                f"Cannot set initial state to {state_id}, as it does not exist"
            )
        self.init_state_id = state_id

    def add_transition(self, transition: Transition):
        """
        Adds a transition to the FSM between states.

        Args:
        transition (Transition): The transition to be added.

        Raises:
        ValueError: If the source or destination state does not exist.
        """
        if (
            transition.source_state_id not in self.states
            or transition.dest_state_id not in self.states
        ):
            raise ValueError(
                f"Cannot add Transition for State with id {transition.source_state_id}, as it does not exist"
            )
        self.states[transition.source_state_id].add_transition(transition)

    def get_start_fsm_actions(self) -> List[Action]:
        """
        Retrieves the actions associated with the initial state of the FSM.

        Returns:
        List[Action]: A list of actions associated with the initial state.

        Raises:
        ValueError: If the initial state does not exist.
        """
        if self.init_state_id not in self.states:
            raise ValueError(
                f"Initial State with id {self.init_state_id} does not exist"
            )
        return self.states[self.init_state_id].actions

    async def _check_daily_limit(
        self, dest_state, ivr_state_doc: IVRCallStateMongoDoc
    ):
        """Check daily listening limit after pre-operation has flagged a check.

        Returns:
            Tuple of (limit_exceeded: bool, limit_actions: List[Action] or None)
        """
        limit_check = ivr_state_doc.experience_data.pop("_daily_limit_check", None)
        if limit_check is None:
            return False, None

        from app.core.state import get_app_state
        app_state = get_app_state()
        collection = app_state.daily_listening_usage_mongo

        if collection is None:
            return False, None

        today = get_ist_date_string()
        limit = settings.ivr_daily_listening_limit_seconds
        duration = limit_check["duration_seconds"]
        language = limit_check["language"]

        current_usage = await get_daily_usage(collection, ivr_state_doc.phone_number, today)

        if current_usage + duration > limit or current_usage >= limit:
            # Limit exceeded - return announcement + hangup
            announcement_text = get_daily_limit_announcement(language)
            vonage_lang = get_vonage_language_code(language)
            limit_actions = [
                TalkAction(text=announcement_text, level=1.0, bargeIn=False, loop=1, language=vonage_lang)
            ]
            return True, limit_actions

        # Within limit - increment usage
        await increment_daily_usage(
            collection,
            ivr_state_doc.phone_number,
            today,
            int(duration),
            tenant_id=ivr_state_doc.tenant_id,
            school_id=limit_check.get("school_id", ""),
        )
        return False, None

    async def get_next_actions(
        self, input_: str, ivr_state_doc: IVRCallStateMongoDoc
    ) -> Tuple[List[Action], str]:
        """
        Determines the next actions and state based on the input and current state.

        Args:
        input_ (str): The input provided to the FSM.
        current_state_id (str): The ID of the current state.

        Returns:
        Tuple[List[Action], str]: A tuple containing the list of actions to be performed next and the next state ID.

        Raises:
        ValueError: If the current state does not exist.
        """
        print("Input", input_)
        current_state_id = ivr_state_doc.current_state_id
        print("Current State", current_state_id)
        self.print_state_transitions(current_state_id)

        if current_state_id not in self.states:
            raise ValueError(f"Current State with id {current_state_id} does not exist")

        current_state = self.states[current_state_id]
        if input_ == "":
            input_ = "empty"

        if input_ not in current_state.transition_map:
            # SEND APPROPRIATE ERROR MESSAGE WITH CURRENT STATE ACTIONS
            print("Invalid Input", input_)
            error_actions: List[Action] = []
            if input_ == "empty":
                has_connect_action = any(
                    isinstance(action, VonageConnectAction)
                    for action in current_state.actions
                )
                if has_connect_action:
                    return [
                        InputAction(type_=["dtmf"], eventApi="/input", timeOut=10)
                    ], current_state_id
                error_actions = self.empty_input_error_actions
            else:
                error_actions = self.invalid_input_error_actions
            return (
                self._prepare_actions_for_call(
                    error_actions + current_state.actions,
                    ivr_state_doc.id,
                ),
                current_state_id,
            )

        if input_ == "9":
            await self._stop_websocket_audio_for_state(current_state, ivr_state_doc.id)

        current_state.post_operation.execute(self, ivr_state_doc)
        dest_state_id = current_state.transition_map[input_].dest_state_id

        dest_state = self.states[dest_state_id]
        dest_state.pre_operation.execute(self, ivr_state_doc)

        # Check daily listening limit if pre-operation flagged a check
        limit_exceeded, limit_actions = await self._check_daily_limit(
            dest_state, ivr_state_doc
        )
        if limit_exceeded:
            return (
                self._prepare_actions_for_call(limit_actions, ivr_state_doc.id),
                dest_state_id,
            )

        transition_actions = current_state.transition_map[input_].actions
        return (
            self._prepare_actions_for_call(
                transition_actions
                + dest_state.process_operation_output_into_actions.execute(
                    state=dest_state, op_output=None, fsm_state_doc=ivr_state_doc
                ),
                ivr_state_doc.id,
            ),
            dest_state_id,
        )

    def _prepare_actions_for_call(
        self, actions: List[Action], conversation_id: str
    ) -> List[Action]:
        prepared_actions: List[Action] = []

        for action in actions:
            if isinstance(action, VonageConnectAction):
                websocket_uri = getattr(action, "websocket_uri", "")
                if websocket_uri:
                    parsed_uri = urlparse(websocket_uri)
                    query_params = parse_qs(parsed_uri.query)
                    query_params["id"] = [conversation_id]
                    updated_query = urlencode(query_params, doseq=True)
                    updated_uri = urlunparse(
                        (
                            parsed_uri.scheme,
                            parsed_uri.netloc,
                            parsed_uri.path,
                            parsed_uri.params,
                            updated_query,
                            parsed_uri.fragment,
                        )
                    )
                    prepared_actions.append(
                        VonageConnectAction(
                            websocket_uri=updated_uri,
                            content_type=action.content_type,
                            headers=dict(action.headers),
                        )
                    )
                    continue

            prepared_actions.append(action)

        return prepared_actions


    async def _stop_websocket_audio_for_state(
        self, current_state, conversation_id: str
    ) -> None:
        """Stop WebSocket audio playback using control WebSocket connection."""
        try:
            ws_service = await get_websocket_service()
            await ws_service.stop_audio(conversation_id)
        except Exception as e:
            print(
                f"Warning: Failed to stop websocket audio for id {conversation_id}: {e}"
            )

    def print_states(self):
        for state_id, state in self.states.items():
            print(f"State {state_id}")
            print("Actions:")
            for action in state.actions:
                print(action)

    def print_transitions(self):
        for state_id, state in self.states.items():
            # print(f"State {state_id}")
            # print("Transitions:")
            for transition in state.transition_map.values():
                print(
                    f"From {state_id} to {transition.dest_state_id} on {transition.input}"
                )

            # print("\n\n")
        print("#################")

    def print_state_transitions(self, state_id):
        state = self.states[state_id]
        print(f"State {state_id}")
        print("Transitions:")
        for transition in state.transition_map.values():
            print(
                f"From {state_id} to {transition.dest_state_id} on {transition.input}"
            )
        print("\n\n")

    def visualize_fsm(
        self, current_state_id=None, depth=0, visited=None, parent_prefix=""
    ):
        """
        Visualizes the structure of the FSM starting from the initial or specified state.

        Args:
        current_state_id (str, optional): The state ID from which to start visualization. Defaults to initial state if not specified.
        depth (int): The current depth in the recursive call stack, used for indentation.
        visited (set, optional): A set to keep track of visited states to avoid infinite loops.
        parent_prefix (str): A string prefix used to format the tree structure visually.

        Returns:
        str: A string representation of the FSM structure.
        """
        # Initialize the recursion
        if visited is None:
            visited = set()
        if current_state_id is None:
            current_state_id = self.init_state_id
            # Start with the initial state
            tree_str = f"FSM ID: {self.fsm_id}\n"
        else:
            tree_str = ""

        # Avoid revisiting states to prevent infinite loops in cyclic FSMs
        if current_state_id in visited:
            return tree_str
        visited.add(current_state_id)

        current_state = self.states[current_state_id]
        indent = "│   " * depth  # Indentation for visualization with vertical lines

        # Add the current state to the visualization
        tree_str += f"{parent_prefix}State ID: {current_state_id}\n"

        transitions = list(current_state.transition_map.items())
        for index, (input_, transition) in enumerate(transitions):
            # Check if this is the last transition to adjust the prefix accordingly
            is_last_transition = index == len(transitions) - 1
            transition_prefix = "└── " if is_last_transition else "├── "
            next_parent_prefix = parent_prefix + (
                "    " if is_last_transition else "│   "
            )

            tree_str += f"{parent_prefix}{transition_prefix}Transition on '{input_}' to State ID: {transition.dest_state_id}\n"

            # Recursively visualize the destination state with updated parent prefix for proper indentation
            tree_str += self.visualize_fsm(
                transition.dest_state_id, depth + 1, visited, next_parent_prefix
            )

        return tree_str
