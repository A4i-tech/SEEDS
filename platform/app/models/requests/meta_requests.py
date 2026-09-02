from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CommandContext(BaseModel):
    activeConferenceId: str = ""
    currentClassId: str = ""
    history: list[dict[str, Any]] = Field(default_factory=list)

    model_config = {"populate_by_name": True}

    @classmethod
    def from_raw(cls, raw: str) -> CommandContext:
        if not raw:
            return cls()
        return cls.model_validate_json(raw)


class TextCommandRequest(BaseModel):
    command: str
    context: CommandContext = Field(default_factory=CommandContext)


class TtsPromptRequest(BaseModel):
    type: str
