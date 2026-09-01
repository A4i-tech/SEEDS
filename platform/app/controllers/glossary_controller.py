"""Glossary controller — /glossary CRUD endpoints (ticket #436, AC5).

Terms are read by TranslationService.get_or_translate() on every fresh AI
translation (via GlossaryNormalizer), so this is the admin-facing surface
for something that was previously write-only (add_term existed, nothing
called it).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.glossary_requests import GlossaryTermCreateRequest
from app.models.responses.glossary import GlossaryTermResponse
from app.platform.auth.dependencies import get_db, require_admin, require_admin_or_reviewer
from app.repositories.glossary_repository import GlossaryRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/glossary", tags=["Glossary"])


@router.post("", summary="Add a glossary term")
async def add_term(
    body: GlossaryTermCreateRequest,
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    repo = GlossaryRepository(db)
    doc = await repo.add_term(body.sourceTerm, body.targetLang, body.translatedTerm)
    return GlossaryTermResponse.from_doc(doc)


@router.get("", summary="List glossary terms, optionally filtered by target language")
async def list_terms(
    targetLang: str | None = None,
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> list[dict[str, Any]]:
    repo = GlossaryRepository(db)
    docs = await (repo.find_by_lang(targetLang) if targetLang else repo.find_all())
    return [GlossaryTermResponse.from_doc(doc) for doc in docs]


@router.delete("/{term_id}", summary="Delete a glossary term")
async def delete_term(
    term_id: str,
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, str]:
    repo = GlossaryRepository(db)
    await repo.delete(term_id)
    return {"status": "deleted"}
