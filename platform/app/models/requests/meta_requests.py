from __future__ import annotations

from pydantic import BaseModel, Field


class HistoryEntry(BaseModel):
    model_config = {"extra": "allow"}

    transcript: str | None = None
    command: str | None = None
    spoken_summary: str | None = None
    response: str | None = None


class CommandContext(BaseModel):
    active_conference_id: str = ""
    current_class_id: str = ""
    history: list[HistoryEntry] = Field(default_factory=list)

    model_config = {"populate_by_name": True}

    @classmethod
    def from_raw(cls, raw: str) -> CommandContext:
        return cls.model_validate_json(raw)


class TextCommandRequest(BaseModel):
    command: str
    context: CommandContext = Field(default_factory=CommandContext)


class TtsPromptRequest(BaseModel):
    type: str
