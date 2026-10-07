from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

HttpsUrl = Annotated[str, StringConstraints(pattern=r"^https://")]


class PartnerContentType(StrEnum):
    STORY = "story"
    BRF = "brf"
    NOTES = "notes"
    QUIZ = "quiz"


class PartnerQuizChoice(BaseModel):
    text: str
    correct: bool = False


class PartnerQuizQuestion(BaseModel):
    text: str
    choices: list[PartnerQuizChoice]


class _PartnerContentCreate(BaseModel):
    language: str
    display_name: str


class PartnerStoryCreate(_PartnerContentCreate):
    type: Literal[PartnerContentType.STORY]
    audio_url: HttpsUrl


class PartnerBrfCreate(_PartnerContentCreate):
    type: Literal[PartnerContentType.BRF]
    brf_url: HttpsUrl
    braille_grade: int = Field(1, ge=1)


class PartnerNotesCreate(_PartnerContentCreate):
    type: Literal[PartnerContentType.NOTES]
    text: str


class PartnerQuizCreate(_PartnerContentCreate):
    type: Literal[PartnerContentType.QUIZ]
    questions: list[PartnerQuizQuestion] = Field(min_length=1)


PartnerContentCreateRequest = Annotated[
    PartnerStoryCreate | PartnerBrfCreate | PartnerNotesCreate | PartnerQuizCreate,
    Field(discriminator="type"),
]


class _ContentPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AudioContentPatch(_ContentPatch):
    audio_url: HttpsUrl


class BrailleContentPatch(_ContentPatch):
    brf_url: HttpsUrl
    braille_grade: int = Field(1, ge=1)


class TextContentPatch(_ContentPatch):
    markdown_url: HttpsUrl


class QuizChoicePatch(_ContentPatch):
    text: str
    value: str = ""
    correct: bool = False


class QuizContentPatch(_ContentPatch):
    raw_html_url: str
    question: str
    choices: list[QuizChoicePatch]


class PartnerContentUpdateRequest(BaseModel):
    content: AudioContentPatch | BrailleContentPatch | TextContentPatch | QuizContentPatch
