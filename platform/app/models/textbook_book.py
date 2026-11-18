from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import PyObjectId
from app.platform.error_handling import ValidationError
from app.services.textbook_upload_validation import validate_language

MAX_BOOK_FILES = 50

class BuiltBook(BaseModel):
    fingerprint: str = ""
    artifacts: dict[str, str] = Field(default_factory=dict)


class TextbookBook(BaseModel):
    model_config = ConfigDict(use_enum_values=True, populate_by_name=True)

    book_id: PyObjectId = Field(alias="_id")
    tenant_id: str
    title: str
    language: str
    job_ids: list[str] = Field(default_factory=list)
    created_at: str = ""
    deleted_at: str = ""
    built: BuiltBook = Field(default_factory=BuiltBook)

    @classmethod
    def from_doc(cls, doc: dict[str, object]) -> TextbookBook:
        return cls.model_validate({k: v for k, v in doc.items() if v is not None})


class CreateBookRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200, description="Book name, printed on the first page")
    language: str = Field("auto", description="Language of the chapter PDFs, or auto to detect it")
    target_language: str = Field(
        "", description="When set, also translate the result into this language once remediation finishes"
    )

    @field_validator("title")
    @classmethod
    def _named(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValidationError("The book name is empty. Type a name for the book, then upload again.")
        return value

    @field_validator("language")
    @classmethod
    def _source_language(cls, value: str) -> str:
        if value != "auto":
            validate_language(value)
        return value

    @field_validator("target_language")
    @classmethod
    def _target_language(cls, value: str) -> str:
        if value:
            validate_language(value)
        return value


class ReorderBookRequest(BaseModel):
    job_ids: list[str] = Field(min_length=1, max_length=MAX_BOOK_FILES)

    @field_validator("job_ids")
    @classmethod
    def _unique(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValidationError("The new order must list every chapter of the book exactly once. Reload the page and try again.")
        return value
