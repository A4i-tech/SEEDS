"""
IVR utility functions for language and configuration mapping.
"""

from typing import Dict


# Language mapping for Vonage TTS codes (module-level constant for performance)
_LANGUAGE_MAPPING: Dict[str, str] = {
    "kannada": "kn-IN",
    "english": "en-US",
    "hindi": "hi-IN",
    "bengali": "bn-IN",
    "tamil": "ta-IN",
    "marathi": "mr-IN"
}


def get_vonage_language_code(language: str) -> str:
    """
    Maps internal language codes to Vonage TTS language codes.

    Args:
        language: Internal language code (kannada, english, hindi, etc.)

    Returns:
        Vonage language code (e.g., "kn-IN", "en-US", "hi-IN")

    Examples:
        >>> get_vonage_language_code("kannada")
        "kn-IN"

        >>> get_vonage_language_code("english")
        "en-US"

        >>> get_vonage_language_code("unknown")
        "en-US"  # Default fallback
    """
    return _LANGUAGE_MAPPING.get(language.lower(), "en-US")
