"""Response schemas for Meta (Seeds AI assistant) endpoints — /meta/*."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProcessCommandResponse(BaseModel):
    """Shape returned by meta_service.process_command — covers all pipeline
    exit points (conversational explanation, needs-input, plan error, and the
    full execute+summarize path), so most fields are optional depending on
    which stage the pipeline stopped at."""

    transcript: str
    reasoning: dict[str, Any] | None = None
    commands: list[dict[str, Any]] = Field(default_factory=list)
    results: list[dict[str, Any]] = Field(default_factory=list)
    spokenSummary: str | None = None
    audioBase64: str | None = None
    error: str | None = None
    needsInput: bool | None = None
    message: str | None = None


class TranscriptResponse(BaseModel):
    transcript: str


class TtsPromptResponse(BaseModel):
    text: str
    audioBase64: str | None = None
