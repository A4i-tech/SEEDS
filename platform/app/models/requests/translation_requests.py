from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

MAX_IMPORT_ROWS = 5000


class TranslationUpdateRequest(BaseModel):
    lang: str
    text: str


class TranslationApproveRequest(BaseModel):
    lang: str


class TranslationRejectRequest(BaseModel):
    lang: str
    reason: str = ""


class BulkApproveRequest(BaseModel):
    route: str | None = None
    lang: str | None = None


class TranslationImportRow(BaseModel):
    route: str = ""
    key: str = ""
    source: str = ""
    text: str = ""


class TranslationImportRequest(BaseModel):
    lang: str
    overwrite_blank: bool = False
    state: Literal["pending", "approved", "keep"] = "pending"
    rows: list[TranslationImportRow] = Field(max_length=MAX_IMPORT_ROWS)
