from __future__ import annotations

from pydantic import BaseModel


class GlossaryTermCreateRequest(BaseModel):
    sourceTerm: str
    targetLang: str
    translatedTerm: str
