from __future__ import annotations

import urllib.request
from unittest.mock import patch

import numpy as np
import pytest

from app.platform.settings import Settings
from app.services.audio.transcriber import AudioTranscriber

MOCK_URL = "http://localhost:8000/v1"


def _mock_up() -> bool:
    try:
        urllib.request.urlopen("http://localhost:8000/health", timeout=1)
    except OSError:
        return False
    return True


needs_mock = pytest.mark.skipif(not _mock_up(), reason="mock model server not answering on http://localhost:8000/health")


def _transcriber(**overrides) -> AudioTranscriber:
    settings = Settings(_env_file=None, audio_analysis_enabled=True, **overrides)
    with patch("app.services.audio.transcriber.get_settings", return_value=settings):
        return AudioTranscriber()


def test_client_gets_base_url_and_model_from_settings():
    t = _transcriber(openai_api_key="k", transcription_base_url="http://stt.local/v1", transcription_model="whisper-large")
    assert str(t.client.base_url) == "http://stt.local/v1/"
    assert t.model == "whisper-large"


def test_transcription_base_url_falls_back_to_shared_url_and_can_be_overridden():
    shared = _transcriber(openai_base_url="http://shared.local/v1")
    assert str(shared.client.base_url) == "http://shared.local/v1/"
    own = _transcriber(openai_base_url="http://shared.local/v1", transcription_base_url="http://stt.local/v1")
    assert str(own.client.base_url) == "http://stt.local/v1/"


def test_no_key_and_no_base_url_means_no_client():
    assert _transcriber().client is None


@needs_mock
async def test_segment_is_transcribed_by_mock_server():
    t = _transcriber(openai_base_url=MOCK_URL)
    pcm = (np.sin(np.linspace(0, 200, 8000)) * 8000).astype(np.int16).tobytes()
    result = await t._transcribe_segment(pcm)
    assert result is not None
    assert result["text"] == "ok"
    assert isinstance(result["duration"], float)
