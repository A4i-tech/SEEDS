from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ReasoningResult(BaseModel):
    intent: str
    reasoning: str
    steps: list[dict[str, Any]] = Field(default_factory=list)
    can_auto_resolve: bool
    unresolved_note: str = ""


class PlannedCommand(BaseModel):
    model_config = {"populate_by_name": True}

    method: str
    path: str
    body: Any = None
    description: str
    for_each: bool = Field(False, validation_alias="forEach")


class StepResult(BaseModel):
    step: str
    status: int
    data: Any = None
    error: str = ""


class ProcessCommandResponse(BaseModel):
    transcript: str
    reasoning: ReasoningResult | None = None
    commands: list[PlannedCommand] = Field(default_factory=list)
    results: list[StepResult] = Field(default_factory=list)
    spoken_summary: str = ""
    audio_base64: str | None = None
    error: str = ""
    needs_input: bool = False
    message: str = ""


class TranscriptResponse(BaseModel):
    transcript: str


class TtsPromptResponse(BaseModel):
    text: str
    audio_base64: str | None = None
