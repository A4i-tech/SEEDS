from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.services.sdk_rolling_hash import js_trim

MAX_IMPORT_ROWS = 5000
LANG_PATTERN = r"^[a-z]{2}(-[A-Z]{2})?$"

type ImportState = Literal["pending", "approved", "keep"]


class TranslationUpdateRequest(BaseModel):
    lang: str = Field(pattern=LANG_PATTERN)
    text: str


class TranslationApproveRequest(BaseModel):
    lang: str = Field(pattern=LANG_PATTERN)


class TranslationRejectRequest(BaseModel):
    lang: str = Field(pattern=LANG_PATTERN)
    reason: str = ""


class BulkApproveRequest(BaseModel):
    route: str | None = None
    lang: str | None = None


class TranslationImportRow(BaseModel):
    route: str
    key: str
    source: str
    text: str
    row: int = Field(ge=1)

    @field_validator("key", "source")
    @classmethod
    def _trim(cls, value: str) -> str:
        return js_trim(value)


class TranslationImportRequest(BaseModel):
    lang: str = Field(pattern=LANG_PATTERN)
    overwrite_blank: bool = False
    state: ImportState = "pending"
    rows: list[TranslationImportRow] = Field(max_length=MAX_IMPORT_ROWS)
