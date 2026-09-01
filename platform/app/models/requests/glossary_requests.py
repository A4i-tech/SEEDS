"""Request schemas for glossary term management (ticket #436, AC5)."""

from __future__ import annotations

from pydantic import BaseModel


class GlossaryTermCreateRequest(BaseModel):
    sourceTerm: str
    targetLang: str
    translatedTerm: str
