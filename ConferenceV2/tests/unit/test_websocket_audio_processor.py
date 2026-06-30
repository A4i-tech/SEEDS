import os
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

os.environ["STORAGE_ACCOUNT_NAME"] = "test"
os.environ["ENVIRONMENT"] = "development"
os.environ["APPLICATIONINSIGHTS_CONNECTION_STRING"] = (
    "InstrumentationKey=test-key;IngestionEndpoint=https://test.com/"
)

sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/../../")

from app.models.participant import CallStatus, Participant, Role
from app.services.audio.websocket_audio_processor import process_audio_message


@pytest.mark.asyncio
async def test_process_audio_message_sets_conference_hold_flag_without_marking_student():
    conference_id = "conf-hold-1"
    student_phone = "911234567890"
    student = Participant(
        name="Student",
        phone_number=student_phone,
        role=Role.STUDENT,
        call_status=CallStatus.CONNECTED,
    )

    conf = SimpleNamespace(
        conf_id=conference_id,
        state=SimpleNamespace(
            participants={student_phone: student},
            action_history=[],
            hold_detected=False,
        ),
        update_state=AsyncMock(),
    )
    conf.state.model_dump = lambda **_kwargs: {
        "participants": {
            student_phone: {
                "phone_number": student_phone,
                "call_status": student.call_status,
            }
        },
        "hold_detected": conf.state.hold_detected,
        "action_history": conf.state.action_history,
    }

    transcriber = SimpleNamespace(
        process_chunk=AsyncMock(
            return_value={
                "text": "The number you have called has currently put your call on hold. Please stay on the line.",
                "segments": [{"text": "hold"}],
            }
        )
    )
    hold_detector = SimpleNamespace(
        detect=AsyncMock(
            return_value={
                "is_hold": True,
                "score": 0.95,
                "threshold": 0.82,
                "matched_phrase": "on hold / stay on the line",
                "detection_method": "rule_based_keywords",
            }
        )
    )

    await process_audio_message(
        b"audio-bytes",
        conf,
        transcriber,
        hold_detector,
        conference_id,
        capture_session=None,
    )

    assert conf.state.hold_detected is True
    assert student.call_status == CallStatus.CONNECTED
    assert len(conf.state.action_history) == 2
    assert conf.state.action_history[0].action_type == "System-AudioAnalysis"
    assert conf.state.action_history[1].action_type == "System-HoldDetected"
    conf.update_state.assert_awaited_once()


@pytest.mark.asyncio
async def test_process_audio_message_detects_hold_across_split_transcripts():
    conference_id = "conf-hold-split"
    student_phone = "911234567891"
    student = Participant(
        name="Student",
        phone_number=student_phone,
        role=Role.STUDENT,
        call_status=CallStatus.CONNECTED,
    )

    conf = SimpleNamespace(
        conf_id=conference_id,
        state=SimpleNamespace(
            participants={student_phone: student},
            action_history=[],
            hold_detected=False,
        ),
        update_state=AsyncMock(),
    )
    conf.state.model_dump = lambda **_kwargs: {
        "participants": {
            student_phone: {
                "phone_number": student_phone,
                "call_status": student.call_status,
            }
        },
        "hold_detected": conf.state.hold_detected,
        "action_history": conf.state.action_history,
    }

    transcriber = SimpleNamespace(
        process_chunk=AsyncMock(
            side_effect=[
                {
                    "text": "the number you have called",
                    "segments": [{"text": "the number you have called"}],
                },
                {
                    "text": "has put your call on hold. please stay on the line.",
                    "segments": [{"text": "has put your call on hold. please stay on the line."}],
                },
            ]
        )
    )

    async def _detect(text):
        normalized = " ".join(text.lower().split())
        is_hold = (
            "the number you have called" in normalized
            and "put your call on hold" in normalized
            and "stay on the line" in normalized
        )
        return {
            "is_hold": is_hold,
            "score": 0.95 if is_hold else 0.7,
            "threshold": 0.82,
            "matched_phrase": "on hold / stay on the line" if is_hold else "",
            "detection_method": "rule_based_keywords" if is_hold else "semantic_similarity",
        }

    hold_detector = SimpleNamespace(detect=AsyncMock(side_effect=_detect))

    await process_audio_message(
        b"audio-bytes-1",
        conf,
        transcriber,
        hold_detector,
        conference_id,
        capture_session=None,
    )

    assert conf.state.hold_detected is False
    conf.update_state.assert_not_awaited()

    await process_audio_message(
        b"audio-bytes-2",
        conf,
        transcriber,
        hold_detector,
        conference_id,
        capture_session=None,
    )

    assert conf.state.hold_detected is True
    assert student.call_status == CallStatus.CONNECTED
    assert len(conf.state.action_history) == 2
    conf.update_state.assert_awaited_once()
