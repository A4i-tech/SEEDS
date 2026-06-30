"""
IVR utility functions for language and configuration mapping.
"""

from typing import Dict


# Language mapping for Vonage TTS codes (keyed by ISO 639-1 codes)
_LANGUAGE_MAPPING: Dict[str, str] = {
    "kn": "kn-IN",
    "en": "en-US",
    "hi": "hi-IN",
    "bn": "bn-IN",
    "ta": "ta-IN",
    "mr": "mr-IN",
}

# Reverse mapping: ISO 639-1 code → Azure blob folder name
_ISO_TO_BLOB_NAME: Dict[str, str] = {
    "en": "english",
    "kn": "kannada",
    "hi": "hindi",
    "bn": "bengali",
    "ta": "tamil",
    "mr": "marathi",
    "or": "odia",
}


def get_vonage_language_code(language: str) -> str:
    """
    Maps ISO 639-1 language codes to Vonage TTS language codes.

    Args:
        language: ISO 639-1 code (e.g. "kn", "en", "hi")

    Returns:
        Vonage language code (e.g., "kn-IN", "en-US", "hi-IN")

    Examples:
        >>> get_vonage_language_code("kn")
        "kn-IN"

        >>> get_vonage_language_code("en")
        "en-US"

        >>> get_vonage_language_code("unknown")
        "en-US"  # Default fallback
    """
    return _LANGUAGE_MAPPING.get(language.lower(), "en-US")


def get_blob_language_name(iso: str) -> str:
    """
    Return the Azure blob folder name for an ISO 639-1 code.

    Args:
        iso: ISO 639-1 language code (e.g. "kn")

    Returns:
        Blob folder name (e.g. "kannada"). Falls back to the input value if unknown.
    """
    return _ISO_TO_BLOB_NAME.get(iso.lower(), iso)
