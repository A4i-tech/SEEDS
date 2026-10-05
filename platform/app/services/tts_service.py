"""Text-to-Speech entry point. TTS_PROVIDER picks the provider."""

from __future__ import annotations

from app.platform.settings import get_settings
from app.providers.tts_provider import get_tts_provider


async def synthesize(
    text: str,
    language: str,
    voice: str | None = None,
    rate: str = "1.0",
) -> bytes:
    return await get_tts_provider(get_settings()).synthesize(text, language, voice, rate)


def add_for_in_option_audio(lang: str, option: str) -> str:
    """Apply language-specific text prefix/suffix for option audio.

    Mirrors jobsUtils.addForInOptionAudio from the JS source.
    """
    res = option.strip()
    match lang.lower():
        case "kn":
            res += "ಗಾಗಿ"
        case "en":
            res = "for " + res
        case "mr":
            res += "साठी"
        case "hi":
            res += " के लिए"
        case "bn":
            res += " জন্য"
    return res
