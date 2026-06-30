import os
from app.actions.base_actions.input_action import InputAction
from app.actions.base_actions.stream_action import StreamAction
from app.actions.base_actions.talk_action import TalkAction
from app.actions.vonage_actions.vonage_action_accumulator import VonageActionAccumulator
from app.actions.vonage_actions.vonage_stream_action import VonageStreamAction
from app.actions.vonage_actions.vonage_talk_action import VonageTalkAction
from app.actions.vonage_actions.vonage_input_action import VonageInputAction
from app.actions.vonage_actions.vonage_connect_action import VonageConnectAction
from app.base_classes.action import Action
from app.base_classes.action_factory import ActionFactory


class VonageActionFactory(ActionFactory):
    def get_action_implmentation(self, action: Action):
        if isinstance(action, StreamAction):
            return VonageStreamAction(streamUrl=action.url,
                                      level=action.extra_args.get("volume", VonageStreamAction.default_level),
                                      bargeIn=action.extra_args.get("bargeIn", VonageStreamAction.default_bargeIn),
                                      loop=action.extra_args.get("loop", VonageStreamAction.default_loop))

        elif isinstance(action, TalkAction):
            return VonageTalkAction(text=action.text,
                                    level=action.extra_args.get("volume", VonageTalkAction.default_level),
                                    bargeIn=action.extra_args.get("bargeIn", VonageTalkAction.default_bargeIn),
                                    loop=action.extra_args.get("loop", VonageTalkAction.default_loop),
                                    language=action.extra_args.get("language", VonageTalkAction.default_language))

        elif isinstance(action, InputAction):
            return VonageInputAction(type_=action.type,
                                    eventUrl=os.getenv("BASE_URL") + action.eventApi,
                                    maxDigits=action.extra_args.get("maxDigits", 1),
                                    timeOut=action.extra_args.get("timeOut", 10),
                                    submitOnHash=action.extra_args.get("submitOnHash", False))

        elif isinstance(action, VonageConnectAction):
            return action

        raise NotImplementedError()


    def get_action_accumulator_implmentation(self):
        return VonageActionAccumulator()
