from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProcessCommandResponse(BaseModel):
    transcript: str
    reasoning: dict[str, Any] | None = None
    commands: list[dict[str, Any]] = Field(default_factory=list)
    results: list[dict[str, Any]] = Field(default_factory=list)
    spokenSummary: str = ""
    audioBase64: str | None = None
    error: str = ""
    needsInput: bool = False
    message: str = ""


class TranscriptResponse(BaseModel):
    transcript: str


class TtsPromptResponse(BaseModel):
    text: str
    audioBase64: str | None = None
