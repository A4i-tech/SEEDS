from __future__ import annotations

from pydantic import BaseModel


class PartnerQuizChoice(BaseModel):
    text: str
    correct: bool = False


class PartnerQuizQuestion(BaseModel):
    text: str
    choices: list[PartnerQuizChoice]


class PartnerContentCreateRequest(BaseModel):
    type: str
    language: str
    display_name: str
    theme: str = ""
    description: str = ""
    audio_url: str = ""
    brf_url: str = ""
    braille_grade: int = 1
    text: str = ""
    questions: list[PartnerQuizQuestion] = []


class PartnerContentUpdateRequest(BaseModel):
    content: dict[str, object]
