"""VonageActionFactory — maps base Action objects to Vonage NCCO implementations.

Ported from IVRv2/app/actions/vonage_actions/vonage_action_factory.py.
"""

from __future__ import annotations

import os

from app.providers.vonage_actions.action_accumulator import VonageActionAccumulator
from app.providers.vonage_actions.base.action import Action
from app.providers.vonage_actions.connect_action import VonageConnectAction
from app.providers.vonage_actions.input_action import InputAction
from app.providers.vonage_actions.stream_action import StreamAction
from app.providers.vonage_actions.talk_action import TalkAction
from app.providers.vonage_actions.vonage_input_action import VonageInputAction
from app.providers.vonage_actions.vonage_stream_action import VonageStreamAction
from app.providers.vonage_actions.vonage_talk_action import VonageTalkAction


class VonageActionFactory:
    """Converts base Action instances to their Vonage-specific NCCO implementations."""

    def get_action_implementation(
        self, action: Action
    ) -> VonageStreamAction | VonageTalkAction | VonageInputAction | VonageConnectAction:
        if isinstance(action, StreamAction):
            return VonageStreamAction(
                streamUrl=action.url,
                level=action.extra_args.get("volume", VonageStreamAction.default_level),  # type: ignore[arg-type]
                bargeIn=action.extra_args.get("bargeIn", VonageStreamAction.default_bargeIn),  # type: ignore[arg-type]
                loop=action.extra_args.get("loop", VonageStreamAction.default_loop),  # type: ignore[arg-type]
            )

        if isinstance(action, TalkAction):
            return VonageTalkAction(
                text=action.text,
                level=action.extra_args.get("volume", VonageTalkAction.default_level),  # type: ignore[arg-type]
                bargeIn=action.extra_args.get("bargeIn", VonageTalkAction.default_bargeIn),  # type: ignore[arg-type]
                loop=action.extra_args.get("loop", VonageTalkAction.default_loop),  # type: ignore[arg-type]
                language=action.extra_args.get("language", VonageTalkAction.default_language),  # type: ignore[arg-type]
            )

        if isinstance(action, InputAction):
            base_url = os.getenv("BASE_URL", "")
            return VonageInputAction(
                type_=action.type,
                eventUrl=base_url + action.eventApi,
                maxDigits=action.extra_args.get("maxDigits", 1),  # type: ignore[arg-type]
                timeOut=action.extra_args.get("timeOut", 10),  # type: ignore[arg-type]
                submitOnHash=action.extra_args.get("submitOnHash", False),  # type: ignore[arg-type]
            )

        if isinstance(action, VonageConnectAction):
            return action

        raise NotImplementedError(f"No Vonage implementation for action type: {type(action)}")

    # Deprecated alias — use get_action_implementation
    get_action_implmentation = get_action_implementation

    def get_action_accumulator_implmentation(self) -> VonageActionAccumulator:  # noqa: N802
        return VonageActionAccumulator()
