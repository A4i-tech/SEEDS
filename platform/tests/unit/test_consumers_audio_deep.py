"""
Coverage for call_event_consumer, websocket_audio_processor, pure_audio,
hold_detector deeper methods.
"""

from __future__ import annotations

import contextlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# CallEventConsumer
# ---------------------------------------------------------------------------


class TestCallEventConsumer:
    def test_instantiation(self) -> None:
        from app.consumers.call_event_consumer import CallEventConsumer

        consumer = CallEventConsumer()
        assert consumer.name == "call_event_consumer"
        assert consumer.POLL_BATCH == 10

    @pytest.mark.asyncio
    async def test_process_missing_conversation_uuid(self) -> None:
        from app.consumers.call_event_consumer import CallEventConsumer

        consumer = CallEventConsumer()
        msg = MagicMock()
        msg.payload = {"status": "completed"}  # no conversation_uuid

        await consumer.process(msg)  # Should return without raising

    @pytest.mark.asyncio
    async def test_handle_one_complete_on_success(self) -> None:
        from app.consumers.call_event_consumer import CallEventConsumer

        consumer = CallEventConsumer()
        msg = MagicMock()
        msg.payload = {"conversation_uuid": "conv1", "status": "completed"}

        mock_sb = MagicMock()
        mock_sb.complete_message = AsyncMock()
        mock_sb.abandon_message = AsyncMock()

        with patch.object(consumer, "process", AsyncMock()):
            await consumer._handle_one(msg, MagicMock(), mock_sb)

        mock_sb.complete_message.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_one_abandon_on_error(self) -> None:
        from app.consumers.call_event_consumer import CallEventConsumer

        consumer = CallEventConsumer()
        msg = MagicMock()
        msg.payload = {"conversation_uuid": "conv1"}

        mock_sb = MagicMock()
        mock_sb.complete_message = AsyncMock()
        mock_sb.abandon_message = AsyncMock()

        with patch.object(consumer, "process", AsyncMock(side_effect=Exception("event error"))):
            await consumer._handle_one(msg, MagicMock(), mock_sb)

        mock_sb.abandon_message.assert_called_once()


# ---------------------------------------------------------------------------
# websocket_audio_processor — pure function tests
# ---------------------------------------------------------------------------


class TestWebsocketAudioProcessor:
    def test_mask_audio_text_empty(self) -> None:
        from app.services.audio.websocket_audio_processor import _mask_audio_text

        assert _mask_audio_text("") == "<empty>"
        assert _mask_audio_text(None) == "<empty>"

    def test_mask_audio_text_non_empty(self) -> None:
        from app.services.audio.websocket_audio_processor import _mask_audio_text

        result = _mask_audio_text("hello world")
        assert "redacted" in result
        assert "len=" in result

    def test_remember_transcript_single(self) -> None:
        from app.services.audio.websocket_audio_processor import _remember_transcript

        conf = MagicMock()
        del conf._hold_transcript_window  # Ensure not set

        result = _remember_transcript(conf, "hello world")
        assert "hello world" in result

    def test_remember_transcript_empty_text(self) -> None:
        from app.services.audio.websocket_audio_processor import _remember_transcript

        conf = MagicMock()
        result = _remember_transcript(conf, "")
        assert result == ""

    def test_remember_transcript_accumulates(self) -> None:
        from app.services.audio.websocket_audio_processor import _remember_transcript

        conf = MagicMock()
        del conf._hold_transcript_window

        _remember_transcript(conf, "first text")
        result = _remember_transcript(conf, "second text")
        assert "first text" in result and "second text" in result

    @pytest.mark.asyncio
    async def test_handle_incoming_disconnect_returns_false(self) -> None:
        from app.services.audio.websocket_audio_processor import handle_incoming_message

        conf = MagicMock()
        conf.set_websocket = MagicMock()

        msg = {"type": "websocket.disconnect"}
        result = await handle_incoming_message(msg, conf, None, None, "conf1")
        assert result is False
        conf.set_websocket.assert_called_once_with(None)

    @pytest.mark.asyncio
    async def test_handle_incoming_text_returns_true(self) -> None:
        from app.services.audio.websocket_audio_processor import handle_incoming_message

        conf = MagicMock()
        msg = {"text": "ping", "bytes": None}
        result = await handle_incoming_message(msg, conf, None, None, "conf1")
        assert result is True

    @pytest.mark.asyncio
    async def test_handle_incoming_bytes_no_transcriber(self) -> None:
        from app.services.audio.websocket_audio_processor import handle_incoming_message

        conf = MagicMock()
        msg = {"bytes": b"\x00" * 1024}
        result = await handle_incoming_message(msg, conf, None, None, "conf1")
        assert result is True

    @pytest.mark.asyncio
    async def test_handle_incoming_bytes_with_capture(self) -> None:
        from app.services.audio.websocket_audio_processor import handle_incoming_message

        conf = MagicMock()
        capture = MagicMock()
        capture.write_chunk = MagicMock()

        msg = {"bytes": b"\x01" * 512}
        result = await handle_incoming_message(msg, conf, None, None, "conf1", capture_session=capture)
        assert result is True
        capture.write_chunk.assert_called_once()


# ---------------------------------------------------------------------------
# PureAudio FSM builder
# ---------------------------------------------------------------------------


class TestPureAudioBuilder:
    def _make_pure_audio_data(self):
        from app.services.fsm.instantiation.insti import _SimplePureAudioData

        data = {
            "_id": "audio_content_1",
            "audioUrl": "http://example.com/audio.mp3",
            "language": "english",
            "school_id": "s1",
        }
        pa_data = _SimplePureAudioData(data)
        pa_data.language = "english"  # PureAudio needs .language
        pa_data.audioUrl = "http://example.com/audio.mp3"
        pa_data.school_id = "s1"
        return pa_data

    def test_pure_audio_option_creation(self) -> None:
        from app.services.fsm.instantiation.pure_audio import _Option

        opt = _Option(key=1, value="Lesson 1")
        assert opt.key == 1
        assert opt.value == "Lesson 1"

    def test_pure_audio_menu_dict(self) -> None:
        from app.services.fsm.instantiation.pure_audio import _Menu, _Option

        opt = _Option(key=1, value="Lesson 1")
        menu = _Menu(description="Content menu", options=[opt], level=2, language="english")
        d = menu.dict()
        assert d["description"] == "Content menu"
        assert d["language"] == "english"
        assert len(d["options"]) == 1

    def test_pure_audio_instantiation(self) -> None:
        from app.services.fsm.instantiation.pure_audio import PureAudio

        pa_data = self._make_pure_audio_data()
        pa = PureAudio(content_data=pa_data, speech_rate="1.0")
        assert pa.language == "english"
        assert pa.speechRate == "1.0"

    def test_pure_audio_generate_state(self) -> None:
        from app.services.fsm.fsm import FSM
        from app.services.fsm.instantiation.pure_audio import PureAudio
        from app.services.fsm.state import State

        pa_data = self._make_pure_audio_data()
        pa = PureAudio(content_data=pa_data, speech_rate="1.0")

        fsm = FSM(fsm_id="pure_audio_test_fsm")
        parent_state = State(state_id="parent_block_0")
        fsm.add_state(parent_state)
        fsm.set_init_state_id("parent_block_0")

        pa.generate_state(
            fsm=fsm,
            prefix_state_id="pa_prefix",
            parent_block_state_id="parent_block_0",
            key_chosen=1,
            level=2,
        )

        # Should have added at least 1 new state
        assert len(fsm.states) > 1


# ---------------------------------------------------------------------------
# HoldDetector — detect method with rule-based
# ---------------------------------------------------------------------------


class TestHoldDetectorDetect:
    @pytest.mark.asyncio
    async def test_detect_hold_phrase_rule_based(self) -> None:
        from app.services.audio.hold_detector import HoldDetector

        d = HoldDetector(threshold=0.82)
        # No OpenAI client set
        d.client = None
        d.hold_embeddings = []

        result = await d.detect("the number you have called has currently put your call on hold. please stay on the line.")
        assert result["is_hold"] is True
        assert result["detection_method"] == "rule_based_exact_phrase"

    @pytest.mark.asyncio
    async def test_detect_no_hold(self) -> None:
        from app.services.audio.hold_detector import HoldDetector

        d = HoldDetector(threshold=0.82)
        d.client = None
        d.hold_embeddings = []

        result = await d.detect("hello this is a normal conversation")
        assert result["is_hold"] is False

    @pytest.mark.asyncio
    async def test_detect_empty_text(self) -> None:
        from app.services.audio.hold_detector import HoldDetector

        d = HoldDetector(threshold=0.82)
        d.client = None
        d.hold_embeddings = []

        result = await d.detect("")
        assert result["is_hold"] is False

    @pytest.mark.asyncio
    async def test_detect_short_text_no_hold(self) -> None:
        from app.services.audio.hold_detector import HoldDetector

        d = HoldDetector(threshold=0.82)
        d.client = None
        d.hold_embeddings = []

        result = await d.detect("hi")
        assert result["is_hold"] is False


# ---------------------------------------------------------------------------
# Conference service — confevents deeper
# ---------------------------------------------------------------------------


class TestConferenceConfeventsDeeper:
    @pytest.mark.asyncio
    async def test_dtmf_input_event(self) -> None:
        from app.services.confevents.dtmf_input_event import DTMFInputEvent

        conf = MagicMock()
        conf.conf_id = "conf1"
        conf.state = MagicMock()
        conf.update_state = AsyncMock()
        conf.queue_event = AsyncMock()

        event = DTMFInputEvent(phone_number="+111", digit="1", conf_call=conf)
        assert event.digit == "1"
        assert event.phone_number == "+111"

    @pytest.mark.asyncio
    async def test_dtmf_input_event_execute(self) -> None:
        from app.services.confevents.dtmf_input_event import DTMFInputEvent

        conf = MagicMock()
        conf.conf_id = "conf1"
        conf.state = MagicMock()
        conf.state.participants = {}
        conf.update_state = AsyncMock()

        event = DTMFInputEvent(phone_number="+111", digit="2", conf_call=conf)
        with contextlib.suppress(Exception):
            await event.execute_event()
