from __future__ import annotations

from typing import Annotated, Literal, NamedTuple, TypedDict

from pydantic import AfterValidator, BaseModel, Field, field_validator

from app.models.translation import AuditDoc, StoredVersionDoc

_JS_WHITESPACE = "".join(
    map(
        chr,
        [0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, *range(0x2000, 0x200B)]
        + [0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF],
    )
)


def js_trim(text: str) -> str:
    return text.strip(_JS_WHITESPACE)


MAX_IMPORT_ROWS = 5000
# Matches a language code: two lowercase letters with optional uppercase region, e.g. "en" or "pt-BR".
LANG_PATTERN = r"^[a-z]{2}(-[A-Z]{2})?$"
# Matches a URL pathname: leading "/" then printable ASCII excluding " # < > ? ^ ` { } \ (the SDK's route charset).
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


class PlannedRow(TypedDict):
    row: int
    route: str
    key: str
    kind: Literal["created", "updated"]
    audits: list[AuditDoc]
    version_doc: StoredVersionDoc | None


class ParsedRow(NamedTuple):
    row: int
    route: str
    key: str
    source: str
    text: str
