"""Vonage NCCO action tests — factory dispatch, accumulator, and each action's get()."""

from __future__ import annotations

import pytest

from app.providers.vonage_actions import (
    InputAction,
    StreamAction,
    TalkAction,
    VonageActionAccumulator,
    VonageActionFactory,
    VonageConnectAction,
)
from app.providers.vonage_actions.base.action import Action
from app.providers.vonage_actions.vonage_input_action import VonageInputAction
from app.providers.vonage_actions.vonage_stream_action import VonageStreamAction
from app.providers.vonage_actions.vonage_talk_action import VonageTalkAction


class PassThroughSas:
    def get_url_with_sas(self, url: str) -> str:
        return url + "?sig=stub"


@pytest.fixture
def factory():
    return VonageActionFactory()


class TestActionFactory:
    def test_stream_action_uses_extra_args(self, factory) -> None:
        impl = factory.get_action_implementation(
            StreamAction(url="https://cdn/a.mp3", volume=0.5, bargeIn=False, loop=3)
        )
        assert isinstance(impl, VonageStreamAction)
        assert (impl.streamUrl, impl.level, impl.bargeIn, impl.loop) == (
            "https://cdn/a.mp3", 0.5, False, 3,
        )

    def test_stream_action_falls_back_to_class_defaults(self, factory) -> None:
        impl = factory.get_action_implementation(StreamAction(url="https://cdn/a.mp3"))
        assert (impl.level, impl.bargeIn, impl.loop) == (
            VonageStreamAction.default_level,
            VonageStreamAction.default_bargeIn,
            VonageStreamAction.default_loop,
        )

    def test_talk_action_carries_language(self, factory) -> None:
        impl = factory.get_action_implementation(TalkAction(text="hello", language="kn-IN"))
        assert isinstance(impl, VonageTalkAction)
        assert impl.language == "kn-IN"

    def test_talk_action_defaults_to_en_us(self, factory) -> None:
        impl = factory.get_action_implementation(TalkAction(text="hello"))
        assert impl.language == VonageTalkAction.default_language

    def test_input_action_prefixes_event_api_with_base_url(self, factory, monkeypatch) -> None:
        monkeypatch.setenv("BASE_URL", "https://api.test")
        impl = factory.get_action_implementation(
            InputAction(type_=["dtmf"], eventApi="/input", maxDigits=4, timeOut=7, submitOnHash=True)
        )
        assert isinstance(impl, VonageInputAction)
        assert impl.eventUrl == "https://api.test/input"
        assert (impl.maxDigits, impl.timeOut, impl.submitOnHash) == (4, 7, True)

    def test_input_action_defaults(self, factory, monkeypatch) -> None:
        monkeypatch.delenv("BASE_URL", raising=False)
        impl = factory.get_action_implementation(InputAction(type_=["dtmf"], eventApi="/input"))
        assert (impl.eventUrl, impl.maxDigits, impl.timeOut, impl.submitOnHash) == (
            "/input", 1, 10, False,
        )

    def test_connect_action_passes_through_unchanged(self, factory) -> None:
        action = VonageConnectAction(websocket_uri="wss://ws.test/socket")
        assert factory.get_action_implementation(action) is action

    def test_unknown_action_type_raises(self, factory) -> None:
        class Mystery(Action):
            def get(self, sas_gen_obj):
                return {}

        with pytest.raises(NotImplementedError):
            factory.get_action_implementation(Mystery())

    def test_deprecated_alias_is_the_same_callable(self, factory) -> None:
        assert VonageActionFactory.get_action_implmentation is (
            VonageActionFactory.get_action_implementation
        )


class TestActionNcco:
    def test_stream_ncco_runs_the_url_through_the_sas_generator(self) -> None:
        action = VonageStreamAction(streamUrl="https://cdn/a.mp3", level=1, bargeIn=True, loop=2)
        assert action.get(PassThroughSas()) == {
            "action": "stream",
            "streamUrl": ["https://cdn/a.mp3?sig=stub"],
            "loop": 2,
            "bargeIn": True,
            "level": 1,
        }

    def test_talk_ncco(self) -> None:
        action = VonageTalkAction(text="hi", level=1, bargeIn=False, loop=1, language="hi-IN")
        assert action.get(PassThroughSas()) == {
            "action": "talk",
            "text": "hi",
            "loop": 1,
            "bargeIn": False,
            "level": 1,
            "language": "hi-IN",
        }

    def test_input_ncco_includes_dtmf_block_for_dtmf_type(self) -> None:
        action = VonageInputAction(
            type_=["dtmf"], maxDigits=2, eventUrl="https://api.test/input", timeOut=5,
            submitOnHash=True,
        )
        ncco = action.get(PassThroughSas())
        assert ncco["eventUrl"] == ["https://api.test/input"]
        assert ncco["dtmf"] == {"maxDigits": 2, "submitOnHash": True, "timeOut": 5}

    def test_input_ncco_omits_dtmf_block_for_speech_type(self) -> None:
        action = VonageInputAction(
            type_=["speech"], maxDigits=1, eventUrl="https://api.test/input", timeOut=5,
            submitOnHash=False,
        )
        assert "dtmf" not in action.get(PassThroughSas())

    def test_connect_ncco_omits_headers_when_empty(self) -> None:
        ncco = VonageConnectAction(websocket_uri="wss://ws.test/s").get(PassThroughSas())
        assert ncco["endpoint"] == [
            {"type": "websocket", "uri": "wss://ws.test/s", "content-type": "audio/l16;rate=8000"}
        ]

    def test_connect_ncco_includes_headers_when_given(self) -> None:
        ncco = VonageConnectAction(
            websocket_uri="wss://ws.test/s", content_type="audio/l16;rate=16000",
            headers={"call_id": "c1"},
        ).get(PassThroughSas())
        assert ncco["endpoint"][0]["headers"] == {"call_id": "c1"}
        assert ncco["endpoint"][0]["content-type"] == "audio/l16;rate=16000"

    @pytest.mark.parametrize(
        "action",
        [
            StreamAction(url="https://cdn/a.mp3"),
            TalkAction(text="hi"),
            InputAction(type_=["dtmf"], eventApi="/input"),
        ],
    )
    def test_base_actions_have_no_ncco_of_their_own(self, action) -> None:
        with pytest.raises(NotImplementedError):
            action.get(PassThroughSas())


class TestActionSerialization:
    def test_round_trip_restores_attributes(self) -> None:
        original = VonageConnectAction(websocket_uri="wss://ws.test/s", headers={"call_id": "c1"})
        restored = Action.from_json(original.to_json())
        assert isinstance(restored, VonageConnectAction)
        assert restored.websocket_uri == "wss://ws.test/s"
        assert restored.headers == {"call_id": "c1"}

    def test_repr_uses_the_str_form(self) -> None:
        action = TalkAction(text="hi")
        assert repr(action) == str(action) == "TalkAction: hi {}"


class TestAccumulator:
    def test_combine_maps_every_action_to_its_ncco_dict(self, monkeypatch) -> None:
        accumulator = VonageActionAccumulator()
        monkeypatch.setattr(accumulator, "_sas_gen", PassThroughSas())
        ncco = accumulator.combine([
            VonageTalkAction(text="hi", level=1, bargeIn=True, loop=1, language="en-US"),
            VonageStreamAction(streamUrl="https://cdn/a.mp3", level=1, bargeIn=True, loop=1),
        ])
        assert [a["action"] for a in ncco] == ["talk", "stream"]

    def test_combine_of_nothing_is_empty(self) -> None:
        assert VonageActionAccumulator().combine([]) == []

    def test_factory_hands_out_an_accumulator(self, factory) -> None:
        assert isinstance(factory.get_action_accumulator_implmentation(), VonageActionAccumulator)
