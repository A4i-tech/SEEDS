from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, field_validator

from app.services.sdk_rolling_hash import js_trim

MAX_IMPORT_ROWS = 5000
LANG_PATTERN = r"^[a-z]{2}(-[A-Z]{2})?$"
ROUTE_PATTERN = r"^/[!-~--[\"#<>?^`{}\\]]*$"
ROUTE_MAX_LENGTH = 2048
KEY_MAX_LENGTH = 256
TEXT_MAX_LENGTH = 5000

ImportState = Literal["pending", "approved", "keep"]


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
    route: Annotated[
        str, AfterValidator(js_trim), Field(min_length=1, max_length=ROUTE_MAX_LENGTH, pattern=ROUTE_PATTERN)
    ]
    key: Annotated[str, AfterValidator(js_trim), Field(min_length=1, max_length=KEY_MAX_LENGTH)]
    source: str = Field(min_length=1, max_length=TEXT_MAX_LENGTH)
    text: str = Field(max_length=TEXT_MAX_LENGTH)
    row: int = Field(ge=1)

    @field_validator("route")
    @classmethod
    def _no_dot_segments(cls, value: str) -> str:
        if {".", ".."} & set(value.split("/")):
            raise ValueError("route must not contain . or .. segments")
        return value


class TranslationImportRequest(BaseModel):
    lang: str = Field(pattern=LANG_PATTERN)
    overwrite_blank: bool = False
    state: ImportState = "pending"
    rows: list[TranslationImportRow] = Field(max_length=MAX_IMPORT_ROWS)
