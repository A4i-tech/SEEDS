from __future__ import annotations

from pydantic import BaseModel


class LanguageCreateRequest(BaseModel):
    name: str
    code: str
    direction: str = "LTR"
    enabled: bool = True


class LanguageUpdateRequest(BaseModel):
    name: str | None = None
    code: str | None = None
    direction: str | None = None
    enabled: bool | None = None
