from __future__ import annotations

from pydantic import BaseModel


class LanguageEntry(BaseModel):
    code: str
    standard: str
    name: str


class LanguageListResponse(BaseModel):
    languages: list[LanguageEntry]
