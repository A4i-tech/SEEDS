from __future__ import annotations

from pydantic import BaseModel


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
