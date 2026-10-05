from __future__ import annotations

import socket

import aiohttp
import pytest
from pydantic import ValidationError

from app.platform.settings import Settings
from app.providers.tts_provider import AzureTtsProvider, OpenAITtsProvider, get_tts_provider

MOCK_URL = "http://localhost:8000/v1"
_ENV = (
    "TTS_PROVIDER", "TTS_MODEL", "TTS_VOICE", "TTS_BASE_URL", "TTS_API_KEY",
    "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "TTS_SUBSCRIPTION_KEY", "TTS_REGION",
)


def _settings(monkeypatch: pytest.MonkeyPatch, **env: str) -> Settings:
    for name in _ENV:
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return Settings(_env_file=None)


def _server_up() -> bool:
    try:
        socket.create_connection(("localhost", 8000), timeout=1).close()
        return True
    except OSError:
        return False


needs_server = pytest.mark.skipif(not _server_up(), reason="mock TTS server at http://localhost:8000/v1 is not running")


def _provider() -> OpenAITtsProvider:
    return OpenAITtsProvider(MOCK_URL, "any", "tts-1", "alloy")


@needs_server
class TestOpenAIContract:
    @pytest.mark.asyncio
    async def test_returns_mp3_bytes(self) -> None:
        audio = await _provider().synthesize("Hello", "en")
        assert audio.startswith(b"ID3")

    @pytest.mark.asyncio
    async def test_empty_text_raises(self) -> None:
        with pytest.raises(RuntimeError, match="empty"):
            await _provider().synthesize("   ", "en")

    @pytest.mark.asyncio
    async def test_non_200_raises_with_status(self) -> None:
        bad = OpenAITtsProvider(MOCK_URL + "/nope", "any", "tts-1", "alloy")
        with pytest.raises(RuntimeError, match=r"HTTP \d{3}.*TTS_BASE_URL"):
            await bad.synthesize("Hello", "en")


class TestOpenAIRequest:
    @pytest.mark.asyncio
    async def test_request_asks_for_mp3_and_voice_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: dict = {}

        class _Resp:
            status = 200

            async def read(self) -> bytes:
                return b"ID3x"

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

        class _Session:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            def post(self, url, json, headers):
                seen.update(url=url, json=json, headers=headers)
                return _Resp()

        monkeypatch.setattr(aiohttp, "ClientSession", _Session)
        audio = await OpenAITtsProvider("http://h/v1/", "k", "m", "alloy").synthesize("Hi", "en", voice="nova")
        assert audio == b"ID3x"
        assert seen["url"] == "http://h/v1/audio/speech"
        assert seen["json"] == {"model": "m", "input": "Hi", "voice": "nova", "response_format": "mp3"}
        assert seen["headers"]["Authorization"] == "Bearer k"

    @pytest.mark.asyncio
    async def test_unsupported_language_raises(self) -> None:
        with pytest.raises(ValueError, match="unsupported language"):
            await _provider().synthesize("Hi", "klingon")


class TestSelector:
    def test_default_is_openai(self, monkeypatch: pytest.MonkeyPatch) -> None:
        s = _settings(monkeypatch, TTS_MODEL="m", TTS_VOICE="v")
        assert isinstance(get_tts_provider(s), OpenAITtsProvider)

    def test_openai(self, monkeypatch: pytest.MonkeyPatch) -> None:
        s = _settings(monkeypatch, TTS_PROVIDER="openai", TTS_MODEL="m", TTS_VOICE="v")
        assert isinstance(get_tts_provider(s), OpenAITtsProvider)

    def test_azure(self, monkeypatch: pytest.MonkeyPatch) -> None:
        s = _settings(monkeypatch, TTS_PROVIDER="azure", AZURE_SPEECH_KEY="k", AZURE_SPEECH_REGION="r")
        assert isinstance(get_tts_provider(s), AzureTtsProvider)

    @pytest.mark.parametrize(
        ("raw", "extra"),
        [
            (" openai ", {"TTS_MODEL": "m", "TTS_VOICE": "v"}),
            ("OPENAI", {"TTS_MODEL": "m", "TTS_VOICE": "v"}),
            ("AzURE", {"AZURE_SPEECH_KEY": "k", "AZURE_SPEECH_REGION": "r"}),
        ],
    )
    def test_provider_name_normalized(self, monkeypatch: pytest.MonkeyPatch, raw: str, extra: dict[str, str]) -> None:
        s = _settings(monkeypatch, TTS_PROVIDER=raw, **extra)
        assert s.tts_provider == raw.strip().lower()

    def test_api_key_falls_back_to_openai_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("OPENAI_API_KEY", "oa")
        s = _settings(monkeypatch, TTS_MODEL="m", TTS_VOICE="v")
        assert get_tts_provider(s)._api_key == "oa"


class TestConfigValidation:
    def test_unknown_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with pytest.raises(ValidationError, match="'azure' or 'openai'"):
            _settings(monkeypatch, TTS_PROVIDER="polly", TTS_MODEL="m", TTS_VOICE="v")

    def test_openai_requires_model_and_voice(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with pytest.raises(ValidationError, match="TTS_MODEL and TTS_VOICE"):
            _settings(monkeypatch, TTS_PROVIDER="openai")

    def test_azure_requires_key_and_region(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with pytest.raises(ValidationError, match="AZURE_SPEECH_KEY"):
            _settings(monkeypatch, TTS_PROVIDER="azure")


class TestSpeechKeyPrecedence:
    def test_azure_settings_win(self, monkeypatch: pytest.MonkeyPatch) -> None:
        s = _settings(
            monkeypatch, TTS_MODEL="m", TTS_VOICE="v", AZURE_SPEECH_KEY="new", AZURE_SPEECH_REGION="newr",
            TTS_SUBSCRIPTION_KEY="old", TTS_REGION="oldr",
        )
        assert (s.speech_key, s.speech_region) == ("new", "newr")

    def test_legacy_settings_used_when_new_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        s = _settings(monkeypatch, TTS_MODEL="m", TTS_VOICE="v", TTS_SUBSCRIPTION_KEY="old", TTS_REGION="oldr")
        assert (s.speech_key, s.speech_region) == ("old", "oldr")
