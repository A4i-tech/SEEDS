from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.services.textbook_upload_validation import validate_language


class CreateJobRequest(BaseModel):
    language: str = Field("en", description="Language the figure alt text is translated into")
    target_language: str = Field(
        "", description="When set, also translate the result into this language once remediation finishes"
    )

    @field_validator("language")
    @classmethod
    def _source_language(cls, value: str) -> str:
        if value != "auto":
            validate_language(value)
        return value

    @field_validator("target_language")
    @classmethod
    def _target_language(cls, value: str) -> str:
        if value != "":
            validate_language(value)
        return value


class DraftUpdateRequest(BaseModel):
    draft_md: str


class VerifyJobRequest(BaseModel):
    title: str = ""


class TranslateJobRequest(BaseModel):
    target_language: str

    @field_validator("target_language")
    @classmethod
    def _supported(cls, value: str) -> str:
        validate_language(value)
        return value
