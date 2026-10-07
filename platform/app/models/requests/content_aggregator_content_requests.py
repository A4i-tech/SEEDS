from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.models.content import AudioContent, TextContent


class PartnerContentCreate(BaseModel):
    """Partner push body — the contentsV3 document shape, snake_case."""

    model_config = ConfigDict(extra="forbid")

    type: str
    language: str
    title: TextContent | None = None
    theme: TextContent | None = None
    description: str = ""
    audio_content: list[AudioContent] = Field(default_factory=list)
    is_pull_model: bool = False
    is_teacher_app: bool = False
    braille_grade: int | None = None


class PartnerContentUpdate(BaseModel):
    """Partial partner update — every contentsV3 field optional."""

    model_config = ConfigDict(extra="forbid")

    type: str | None = None
    language: str | None = None
    title: TextContent | None = None
    theme: TextContent | None = None
    description: str | None = None
    audio_content: list[AudioContent] | None = None
    is_pull_model: bool | None = None
    is_teacher_app: bool | None = None
    braille_grade: int | None = None
