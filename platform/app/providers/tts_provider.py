from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

import aiohttp

if TYPE_CHECKING:
    from app.platform.settings import Settings

logger = logging.getLogger(__name__)

_TRANSLATION_TO_AZURE: dict[str, str] = {
    "kn": "kn-IN",
    "en": "en-IN",
    "hi": "hi-IN",
    "mr": "mr-IN",
    "ta": "ta-IN",
    "bn": "bn-IN",
    "or": "or-IN",
}

_VOICE_NAME: dict[str, str] = {
    "en-IN": "en-IN-NeerjaNeural",
    "kn-IN": "kn-IN-SapnaNeural",
    "hi-IN": "hi-IN-SwaraNeural",
    "ta-IN": "ta-IN-PallaviNeural",
    "mr-IN": "mr-IN-AarohiNeural",
    "bn-IN": "bn-IN-TanishaaNeural",
    "or-IN": "or-IN-SubhasiniNeural",
}

_OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"


def _get_tts_attributes(language: str) -> tuple[str, str] | None:
    lang_code = _TRANSLATION_TO_AZURE.get(language.lower())
    if not lang_code:
        return None
    voice = _VOICE_NAME.get(lang_code)
    if not voice:
        return None
    return lang_code, voice


def _build_ssml(text: str, language_code: str, voice_name: str, rate: str = "1.0") -> str:
    return (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="{language_code}">'
        f'<voice name="{voice_name}">'
        f'<prosody rate="{rate}" volume="+100.00%">{text}</prosody>'
        f'<mstts:silence type="Leading-exact" value="0ms"/>'
        f'<mstts:silence type="Tailing-exact" value="0ms"/>'
        f"</voice></speak>"
    )


class TtsProvider(ABC):
    @abstractmethod
    async def synthesize(
        self, text: str, language: str, voice: str | None = None, rate: str = "1.0"
    ) -> bytes:
        ...


class AzureTtsProvider(TtsProvider):
    def __init__(self, key: str, region: str) -> None:
        if not key or not region:
            raise ValueError(
                "Azure speech requires AZURE_SPEECH_KEY and AZURE_SPEECH_REGION. "
                "Set both, or set TTS_PROVIDER=openai."
            )
        self._key = key
        self._region = region

    async def synthesize(
        self, text: str, language: str, voice: str | None = None, rate: str = "1.0"
    ) -> bytes:
        attrs = _get_tts_attributes(language)
        if attrs is None:
            raise ValueError(f"TTS: unsupported language {language!r}")
        lang_code, default_voice = attrs
        voice_name = voice or default_voice

        logger.info("tts: azure synthesising text_len=%d lang=%s voice=%s", len(text), lang_code, voice_name)
        ssml = _build_ssml(text, lang_code, voice_name, rate)

        try:
            import azure.cognitiveservices.speech as sdk  # type: ignore[import]  # noqa: PLC0415
        except ImportError:
            return await self._synthesize_via_rest(ssml)

        speech_config = sdk.SpeechConfig(subscription=self._key, region=self._region)
        speech_config.set_speech_synthesis_output_format(
            sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )
        synthesizer = sdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
        result = synthesizer.speak_ssml_async(ssml).get()
        if result.reason == sdk.ResultReason.SynthesizingAudioCompleted:
            return bytes(result.audio_data)
        raise RuntimeError(f"TTS SDK synthesis failed: {result.cancellation_details.error_details}")

    async def _synthesize_via_rest(self, ssml: str) -> bytes:
        url = f"https://{self._region}.tts.speech.microsoft.com/cognitiveservices/v1"
        headers = {
            "Ocp-Apim-Subscription-Key": self._key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
            "User-Agent": "platform/tts",
        }
        async with aiohttp.ClientSession() as session, session.post(
            url, data=ssml.encode("utf-8"), headers=headers
        ) as resp:
            if resp.status != 200:
                raise RuntimeError(f"TTS REST error {resp.status}: {await resp.text()}")
            return await resp.read()


class OpenAITtsProvider(TtsProvider):
    def __init__(self, base_url: str, api_key: str, model: str, voice: str) -> None:
        if not model or not voice:
            raise ValueError("OpenAI speech requires TTS_MODEL and TTS_VOICE. Set both in the environment.")
        self._base_url = (base_url or _OPENAI_DEFAULT_BASE_URL).rstrip("/")
        self._api_key = api_key
        self._model = model
        self._voice = voice

    async def synthesize(
        self, text: str, language: str, voice: str | None = None, rate: str = "1.0"
    ) -> bytes:
        # rate is Azure SSML only; the OpenAI endpoint has no equivalent.
        if _get_tts_attributes(language) is None:
            raise ValueError(f"TTS: unsupported language {language!r}")
        if not text or not text.strip():
            raise RuntimeError("TTS: text is empty. Pass non-empty text to synthesize.")

        body = {
            "model": self._model,
            "input": text,
            "voice": voice or self._voice,
            "response_format": "mp3",
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}
        async with aiohttp.ClientSession() as session, session.post(
            f"{self._base_url}/audio/speech", json=body, headers=headers
        ) as resp:
            if resp.status != 200:
                raise RuntimeError(
                    f"TTS server returned HTTP {resp.status}: {await resp.text()}. "
                    "Check TTS_BASE_URL, TTS_API_KEY, TTS_MODEL and TTS_VOICE."
                )
            return await resp.read()


def get_tts_provider(settings: Settings) -> TtsProvider:
    if settings.tts_provider == "azure":
        return AzureTtsProvider(settings.speech_key, settings.speech_region)
    return OpenAITtsProvider(
        settings.tts_base_url,
        settings.tts_api_key or settings.openai_api_key,
        settings.tts_model,
        settings.tts_voice,
    )
