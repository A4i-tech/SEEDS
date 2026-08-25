"""Per-content-type upload validation (strategy pattern).

Each content type owns the rule for validating its uploaded file field, so
adding a new content type (e.g. video) means adding one entry here instead of
branching inside ContentService.
"""

from __future__ import annotations

from typing import Any, Protocol


class _HasFields(Protocol):
    audio_content: list[Any] | None
    braille_url: str | None


def _validate_audio(body: _HasFields) -> None:
    for item in body.audio_content or []:
        audio_url = item.get("audio_url", "")
        if audio_url and not audio_url.lower().endswith(".mp3"):
            raise ValueError("Only .mp3 audio files are allowed.")


def _validate_brf(body: _HasFields) -> None:
    braille_url = getattr(body, "braille_url", None)
    if braille_url and not braille_url.lower().endswith(".brf"):
        raise ValueError("Only .brf files are allowed for braille content.")


CONTENT_TYPE_VALIDATORS = {
    "brf": _validate_brf,
}
_DEFAULT_VALIDATOR = _validate_audio


def validate_content_upload(content_type: str, body: _HasFields) -> None:
    validator = CONTENT_TYPE_VALIDATORS.get(content_type, _DEFAULT_VALIDATOR)
    validator(body)


ALLOWED_UPLOAD_EXTENSIONS = (".mp3", ".brf")
