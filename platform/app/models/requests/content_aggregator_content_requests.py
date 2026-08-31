from __future__ import annotations

from pydantic import BaseModel, field_validator

from app.platform.error_handling import AppError


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

    @field_validator("audio_url", "brf_url")
    @classmethod
    def _validate_https(cls, v: str, info) -> str:
        if v and not v.startswith("https://"):
            raise AppError("URL_NOT_HTTPS", f"{info.field_name} must be an https:// URL", 400)
        return v


class PartnerContentUpdateRequest(BaseModel):
    content: dict[str, object]
