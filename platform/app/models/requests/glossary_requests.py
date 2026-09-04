from __future__ import annotations

from pydantic import BaseModel


class GlossaryTermCreateRequest(BaseModel):
    source_term: str
    target_lang: str
    translated_term: str
