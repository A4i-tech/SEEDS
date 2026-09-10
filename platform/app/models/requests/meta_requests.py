from __future__ import annotations

from pydantic import BaseModel, Field


class HistoryEntry(BaseModel):
    model_config = {"extra": "allow"}

    transcript: str | None = Field(default=None, max_length=2000)
    command: str | None = Field(default=None, max_length=2000)
    spoken_summary: str | None = Field(default=None, max_length=2000)
    response: str | None = Field(default=None, max_length=2000)


class CommandContext(BaseModel):
    active_conference_id: str = ""
    current_class_id: str = ""
    history: list[HistoryEntry] = Field(default_factory=list, max_length=20)

    model_config = {"populate_by_name": True}

    @classmethod
    def from_raw(cls, raw: str) -> CommandContext:
        return cls.model_validate_json(raw)


class TextCommandRequest(BaseModel):
    command: str = Field(max_length=2000)
    context: CommandContext = Field(default_factory=CommandContext)


class TtsPromptRequest(BaseModel):
    type: str
