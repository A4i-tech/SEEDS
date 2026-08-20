"""Request schemas for Meta (Seeds AI assistant) endpoints — /meta/*."""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field


class CommandContext(BaseModel):
    """Client-supplied context accompanying a voice/text command.

    Sent as a JSON string in the multipart form for /voice-command, and as a
    nested JSON object for /text-command — `from_raw` normalizes the former.
    """

    activeConferenceId: str | None = None
    currentClassId: str | None = None
    history: list[dict[str, Any]] = Field(default_factory=list)

    model_config = {"populate_by_name": True}

    @classmethod
    def from_raw(cls, raw: str | None) -> CommandContext:
        """Parse the raw JSON string form field used by /voice-command.

        Raises ValueError (invalid JSON) or pydantic ValidationError (wrong
        shape) — callers translate both to a 400.
        """
        if not raw:
            return cls()
        parsed = json.loads(raw)
        return cls.model_validate(parsed) if isinstance(parsed, dict) else cls()


class TextCommandRequest(BaseModel):
    command: str
    context: CommandContext = Field(default_factory=CommandContext)


class TtsPromptRequest(BaseModel):
    type: str
