"""
Text-to-Speech service.

Ported from backend-server/src/services/ttsService.js (Microsoft Cognitive Services).

SECURITY:
  - Speech subscription key is NEVER logged.
  - Voice / language mappings kept identical to JS source for backward compat.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Language / voice mappings (from ttsService.js)
# ---------------------------------------------------------------------------

_HUMAN_TO_TRANSLATION: dict[str, str] = {
    "english": "en",
    "kannada": "kn",
    "hindi": "hi",
    "marathi": "mr",
    "tamil": "ta",
    "bengali": "bn",
    "odia": "or",
}

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


def _get_tts_attributes(language: str) -> tuple[str, str] | None:
    """Return (language_code, voice_name) for *language*, or None if unsupported."""
    translation_code = _HUMAN_TO_TRANSLATION.get(language.lower())
    if not translation_code:
        return None
    lang_code = _TRANSLATION_TO_AZURE.get(translation_code)
    if not lang_code:
        return None
    voice = _VOICE_NAME.get(lang_code)
    if not voice:
        return None
    return lang_code, voice


def _build_ssml(text: str, language_code: str, voice_name: str, rate: str = "1.0") -> str:
    """Build SSML payload — mirrors the JS ttsService template."""
    return (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="{language_code}">'
        f'<voice name="{voice_name}">'
        f'<prosody rate="{rate}" volume="+100.00%">{text}</prosody>'
        f'<mstts:silence type="Leading-exact" value="0ms"/>'
        f'<mstts:silence type="Tailing-exact" value="0ms"/>'
        f"</voice></speak>"
    )


async def synthesize(
    text: str,
    language: str,
    voice: str | None = None,
    rate: str = "1.0",
) -> bytes:
    """Convert *text* to speech audio and return raw WAV/MP3 bytes.

    Uses azure-cognitiveservices-speech SDK when available; falls back to the
    Azure Cognitive Services REST endpoint.

    Args:
        text:     Text to synthesise.
        language: Human language name (e.g. "kannada", "english").
        voice:    Override voice name. If None, the default for *language* is used.
        rate:     Prosody rate string (e.g. "1.0", "slow").

    Returns:
        Raw audio bytes (MP3 at 16 kHz mono, mirroring JS output format).

    SECURITY: subscription key / token never logged.
    """
    from app.platform.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    attrs = _get_tts_attributes(language)
    if attrs is None:
        raise ValueError(f"TTS: unsupported language {language!r}")

    lang_code, default_voice = attrs
    voice_name = voice or default_voice

    logger.info("tts_service: synthesising text_len=%d lang=%s voice=%s", len(text), lang_code, voice_name)

    ssml = _build_ssml(text, lang_code, voice_name, rate)

    # --- Try SDK first ---
    try:
        import azure.cognitiveservices.speech as sdk  # type: ignore[import]

        speech_key = (
            getattr(settings, "azure_speech_key", "")
            or getattr(settings, "tts_subscription_key", "")
            or ""
        )
        speech_region = (
            getattr(settings, "azure_speech_region", "")
            or getattr(settings, "tts_region", "")
            or ""
        )

        if not speech_key:
            # Fall through to REST
            raise ImportError("no key")

        speech_config = sdk.SpeechConfig(subscription=speech_key, region=speech_region)
        speech_config.set_speech_synthesis_output_format(
            sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )

        synthesizer = sdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
        result = synthesizer.speak_ssml_async(ssml).get()

        if result.reason == sdk.ResultReason.SynthesizingAudioCompleted:
            audio_data: bytes = bytes(result.audio_data)
            logger.info("tts_service: synthesis complete via SDK, bytes=%d", len(audio_data))
            return audio_data
        else:
            raise RuntimeError(f"TTS SDK synthesis failed: {result.cancellation_details.error_details}")

    except (ImportError, AttributeError):
        # SDK not installed or key missing — use REST endpoint
        pass

    # --- REST fallback ---
    return await _synthesize_via_rest(ssml, settings)


async def _synthesize_via_rest(ssml: str, settings) -> bytes:
    """Call the Azure TTS REST endpoint and return raw audio bytes.

    SECURITY: Authorization header is never logged.
    """
    import aiohttp  # noqa: PLC0415

    speech_key = (
        getattr(settings, "azure_speech_key", "")
        or getattr(settings, "tts_subscription_key", "")
        or ""
    )
    speech_region = (
        getattr(settings, "azure_speech_region", "")
        or getattr(settings, "tts_region", "")
        or ""
    )

    if not speech_key or not speech_region:
        raise RuntimeError(
            "TTS requires AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables."
        )

    url = f"https://{speech_region}.tts.speech.microsoft.com/cognitiveservices/v1"
    headers = {
        "Ocp-Apim-Subscription-Key": speech_key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
        "User-Agent": "platform/tts",
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, data=ssml.encode("utf-8"), headers=headers) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise RuntimeError(f"TTS REST error {resp.status}: {error_text}")
            audio_bytes = await resp.read()

    logger.info("tts_service: synthesis complete via REST, bytes=%d", len(audio_bytes))
    return audio_bytes


def add_for_in_option_audio(lang: str, option: str) -> str:
    """Apply language-specific text prefix/suffix for option audio.

    Mirrors jobsUtils.addForInOptionAudio from the JS source.
    """
    res = option.strip()
    match lang.lower():
        case "kannada":
            res += "ಗಾಗಿ"
        case "english":
            res = "for " + res
        case "marathi":
            res += "साठी"
        case "hindi":
            res += " के लिए"
        case "bengali":
            res += " জন্য"
    return res
