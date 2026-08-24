"""Canonical SEEDS language registry (spec §6.8).

app.services.fsm.utils's _ISO_TO_BLOB_NAME / _LANGUAGE_MAPPING are a
narrower, separate concern (IVR audio delivery: Vonage TTS locale + blob
folder naming) and do not cover the full set below (missing Telugu,
Konkani, Bodo). This module is the single source of truth for the
partner-facing /v1/languages registry.
"""

from __future__ import annotations

SUPPORTED_LANGUAGES: tuple[dict[str, str], ...] = (
    {"code": "kn", "standard": "ISO 639-1", "name": "Kannada"},
    {"code": "hi", "standard": "ISO 639-1", "name": "Hindi"},
    {"code": "en", "standard": "ISO 639-1", "name": "English"},
    {"code": "ta", "standard": "ISO 639-1", "name": "Tamil"},
    {"code": "te", "standard": "ISO 639-1", "name": "Telugu"},
    {"code": "mr", "standard": "ISO 639-1", "name": "Marathi"},
    {"code": "kok", "standard": "ISO 639-3", "name": "Konkani"},
    {"code": "brx", "standard": "ISO 639-3", "name": "Bodo"},
)
