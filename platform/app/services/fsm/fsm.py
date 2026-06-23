"""IVR Finite State Machine engine.

Ported from IVRv2/app/fsm/fsm.py — import paths updated, logic unchanged.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from app.platform.settings import get_settings
from app.providers.vonage_actions.base.action import Action
from app.providers.vonage_actions.connect_action import VonageConnectAction
from app.providers.vonage_actions.input_action import InputAction
from app.providers.vonage_actions.stream_action import StreamAction
from app.providers.vonage_actions.talk_action import TalkAction
from app.services.fsm.transition import Transition

if TYPE_CHECKING:
    from app.models.ivr_state import IVRCallStateMongoDoc, IVRfsmDoc
    from app.services.fsm.state import State

logger = logging.getLogger(__name__)


class FSM:
    """IVR Finite State Machine."""

    STORAGE_ACCOUNT_BASE_URL: str = ""  # set at construction from settings

    def __init__(self, fsm_id: str) -> None:

        settings = get_settings()
        storage_account_name = settings.azure_storage_account_name
        if storage_account_name:
            self.STORAGE_ACCOUNT_BASE_URL = (
                f"https://{storage_account_name}.blob.core.windows.net/pull-model-menus/"
            )
        else:
            self.STORAGE_ACCOUNT_BASE_URL = ""

        NO_OPTION_URL = (
            f"{self.STORAGE_ACCOUNT_BASE_URL}"
            "chosenNoOptionDialog/kannada/Sorry,%20you%20have%20not%20chosen%20any%20option/1.0.mp3"
        )
        WRONG_INPUT_URL = (
            f"{self.STORAGE_ACCOUNT_BASE_URL}"
            "chosenWrongOptionDialog/kannada/Sorry,%20you%20have%20chosen%20the%20wrong%20option/1.0.mp3"
        )


        self.fsm_id = fsm_id
        self.states: dict[str, State] = {}
        self.init_state_id = "LA0"
        self.invalid_input_error_actions: list[Action] = [StreamAction(WRONG_INPUT_URL)]
        self.empty_input_error_actions: list[Action] = [StreamAction(NO_OPTION_URL)]

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def serialize(self) -> IVRfsmDoc:
        from app.models.ivr_state import IVRfsmDoc  # noqa: PLC0415

        states = [s.serialize() for s in self.states.values()]
        transitions: list[dict] = []
        for s in self.states.values():
            transitions.extend(s.serialize_transitions())

        return IVRfsmDoc(
            _id=self.fsm_id,
            init_state_id=self.init_state_id,
            states=states,
            transitions=transitions,
            created_at=int(datetime.now().timestamp()),
        )

    @staticmethod
    def deserialize(data: IVRfsmDoc) -> FSM:
        from app.services.fsm.state import State  # noqa: PLC0415

        fsm = FSM(data.id)
        for state_json in data.states:
            state_obj = State.from_json(state_json)
            fsm.add_state(state_obj)

        fsm.set_init_state_id(data.init_state_id)

        for transition_json in data.transitions:
            transition_obj = Transition.from_json(transition_json)
            fsm.add_transition(transition_obj)

        return fsm

    # ------------------------------------------------------------------
    # State management
    # ------------------------------------------------------------------

    def get_state(self, state_id: str) -> State | None:
        return self.states.get(state_id)

    def set_end_state(self, state: State) -> None:
        self.end_state = state
        self.add_state(state)

    def add_state(self, state: State) -> None:
        if state.id in self.states:
            raise ValueError(f"State with id '{state.id}' already exists")
        self.states[state.id] = state

    def set_init_state_id(self, state_id: str) -> None:
        if state_id not in self.states:
            raise ValueError(f"Cannot set initial state to '{state_id}' — not found")
        self.init_state_id = state_id

    def add_transition(self, transition: Transition) -> None:
        if (
            transition.source_state_id not in self.states
            or transition.dest_state_id not in self.states
        ):
            raise ValueError(
                f"Cannot add Transition: state '{transition.source_state_id}' or "
                f"'{transition.dest_state_id}' does not exist"
            )
        self.states[transition.source_state_id].add_transition(transition)

    def get_start_fsm_actions(self) -> list[Action]:
        if self.init_state_id not in self.states:
            raise ValueError(f"Initial state '{self.init_state_id}' does not exist")
        return self.states[self.init_state_id].actions

    # ------------------------------------------------------------------
    # Daily limit check (async — called from get_next_actions)
    # ------------------------------------------------------------------

    async def _check_daily_limit(
        self,
        dest_state: State,
        ivr_state_doc: IVRCallStateMongoDoc,
    ) -> tuple[bool, list[Action] | None]:
        """Check daily listening limit after pre-operation has flagged a check."""
        limit_check = ivr_state_doc.experience_data.pop("_daily_limit_check", None)
        if limit_check is None:
            return False, None

        from app.platform.database import get_database  # noqa: PLC0415
        from app.services.fsm.utils import (  # noqa: PLC0415
            get_daily_limit_announcement,
            get_ist_date_string,
            get_vonage_language_code,
        )

        settings = get_settings()
        db = get_database()
        collection = db["dailyListeningUsage"]

        today = get_ist_date_string()
        limit = settings.ivr_daily_listening_limit_seconds
        duration = limit_check["duration_seconds"]
        language = limit_check["language"]

        # Get current usage
        doc = await collection.find_one(
            {"phone_number": ivr_state_doc.phone_number, "date": today}
        )
        current_usage = doc.get("total_seconds", 0) if doc else 0

        if current_usage + duration > limit or current_usage >= limit:
            announcement_text = get_daily_limit_announcement(language)
            vonage_lang = get_vonage_language_code(language)
            limit_actions: list[Action] = [
                TalkAction(
                    text=announcement_text,
                    level=1.0,
                    bargeIn=False,
                    loop=1,
                    language=vonage_lang,
                )
            ]
            return True, limit_actions

        # Within limit — increment usage atomically
        IST = timezone(timedelta(hours=5, minutes=30))
        await collection.update_one(
            {"phone_number": ivr_state_doc.phone_number, "date": today},
            {
                "$inc": {"total_seconds": int(duration)},
                "$set": {
                    "tenant_id": ivr_state_doc.tenant_id,
                    "school_id": limit_check.get("school_id", ""),
                    "updated_at": datetime.now(IST),
                },
                "$setOnInsert": {
                    "phone_number": ivr_state_doc.phone_number,
                    "date": today,
                },
            },
            upsert=True,
        )
        return False, None

    # ------------------------------------------------------------------
    # Core FSM step
    # ------------------------------------------------------------------

    async def get_next_actions(
        self,
        input_: str,
        ivr_state_doc: IVRCallStateMongoDoc,
    ) -> tuple[list[Action], str]:
        """Return (actions, next_state_id) for the given DTMF *input_*."""
        current_state_id = ivr_state_doc.current_state_id

        if current_state_id not in self.states:
            raise ValueError(f"Current state '{current_state_id}' does not exist")

        current_state = self.states[current_state_id]
        if input_ == "":
            input_ = "empty"

        if input_ not in current_state.transition_map:
            # Invalid / empty input — return error + re-play current state
            if input_ == "empty":
                has_connect = any(
                    isinstance(a, VonageConnectAction) for a in current_state.actions
                )
                if has_connect:
                    return (
                        [InputAction(type_=["dtmf"], eventApi="/dtmf", timeOut=10)],
                        current_state_id,
                    )
                error_actions = self.empty_input_error_actions
            else:
                error_actions = self.invalid_input_error_actions

            return (
                self._prepare_actions_for_call(
                    error_actions + current_state.actions, ivr_state_doc.id
                ),
                current_state_id,
            )

        # Key "9" stops WebSocket audio before navigating back
        if input_ == "9":
            await self._stop_websocket_audio_for_state(current_state, ivr_state_doc.id)

        current_state.post_operation.execute(self, ivr_state_doc)
        dest_state_id = current_state.transition_map[input_].dest_state_id
        dest_state = self.states[dest_state_id]
        dest_state.pre_operation.execute(self, ivr_state_doc)

        # Check daily limit if pre-operation set a flag
        limit_exceeded, limit_actions = await self._check_daily_limit(
            dest_state, ivr_state_doc
        )
        if limit_exceeded:
            return (
                self._prepare_actions_for_call(limit_actions or [], ivr_state_doc.id),
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
        self, actions: list[Action], conversation_id: str
    ) -> list[Action]:
        """Inject the conversation ID into VonageConnectAction WebSocket URIs."""
        prepared: list[Action] = []
        for action in actions:
            if isinstance(action, VonageConnectAction) and getattr(action, "websocket_uri", ""):
                parsed_uri = urlparse(action.websocket_uri)
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
                prepared.append(
                    VonageConnectAction(
                        websocket_uri=updated_uri,
                        content_type=action.content_type,
                        headers=dict(action.headers),
                    )
                )
            else:
                prepared.append(action)
        return prepared

    async def _stop_websocket_audio_for_state(
        self, current_state: State, conversation_id: str
    ) -> None:
        """Stop WebSocket audio via the WebSocket client provider."""
        try:
            from app.providers.websocket_client import get_websocket_service  # noqa: PLC0415

            ws_service = await get_websocket_service()
            await ws_service.stop_audio(conversation_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "FSM: failed to stop websocket audio for %s: %s", conversation_id, exc
            )

    # ------------------------------------------------------------------
    # Debug / visualisation helpers
    # ------------------------------------------------------------------

    def print_states(self) -> None:
        for state_id, state in self.states.items():
            print(f"State {state_id}")
            for action in state.actions:
                print(action)

    def print_transitions(self) -> None:
        for state_id, state in self.states.items():
            for t in state.transition_map.values():
                print(f"From {state_id} to {t.dest_state_id} on '{t.input}'")
        print("#################")

    def print_state_transitions(self, state_id: str) -> None:
        state = self.states[state_id]
        print(f"State {state_id}")
        for t in state.transition_map.values():
            print(f"From {state_id} to {t.dest_state_id} on '{t.input}'")

    def visualize_fsm(
        self,
        current_state_id: str | None = None,
        depth: int = 0,
        visited: set | None = None,
        parent_prefix: str = "",
    ) -> str:
        if visited is None:
            visited = set()
        if current_state_id is None:
            current_state_id = self.init_state_id
            tree_str = f"FSM ID: {self.fsm_id}\n"
        else:
            tree_str = ""

        if current_state_id in visited:
            return tree_str
        visited.add(current_state_id)

        current_state = self.states[current_state_id]
        tree_str += f"{parent_prefix}State ID: {current_state_id}\n"

        transitions = list(current_state.transition_map.items())
        for index, (input_, transition) in enumerate(transitions):
            is_last = index == len(transitions) - 1
            prefix = "└── " if is_last else "├── "
            next_prefix = parent_prefix + ("    " if is_last else "│   ")
            tree_str += f"{parent_prefix}{prefix}Transition on '{input_}' to: {transition.dest_state_id}\n"
            tree_str += self.visualize_fsm(
                transition.dest_state_id, depth + 1, visited, next_prefix
            )

        return tree_str
