from __future__ import annotations

from datetime import datetime
from typing import TypedDict


class TranslationEntry(TypedDict, total=False):
    text: str
    provider: str
    quality_score: float
    status: str
    created_by: str
    created_at: datetime
    approved_by: str
    approved_at: datetime


class AuditDoc(TypedDict):
    site_id: str
    route: str
    key: str
    lang: str
    action: str
    actor: str
    provider: str | None
    detail: str
    at: datetime


class VersionDoc(TypedDict):
    version: int
    translations: dict[str, TranslationEntry]
    approved_by: str
    approved_at: datetime
    created_at: datetime


class StoredVersionDoc(VersionDoc):
    translation_id: str
