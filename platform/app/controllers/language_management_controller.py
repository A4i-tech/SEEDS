from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.language_requests import LanguageCreateRequest, LanguageUpdateRequest
from app.models.responses.common import StatusResponse
from app.models.responses.language import LanguageResponse
from app.platform.auth.dependencies import get_db, require_tenant
from app.platform.error_handling import NotFoundError
from app.repositories.language_repository import LanguageRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/languages", tags=["Languages"])

@router.get("", summary="List languages (enabled-only by default, for the runtime SDK)")
async def list_languages(
    enabledOnly: bool = True,
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> list[LanguageResponse]:
    repo = LanguageRepository(db)
    docs = await repo.find_all(enabled_only=enabledOnly)
    return [LanguageResponse.from_doc(doc) for doc in docs]


@router.post("", summary="Add a language")
async def create_language(
    body: LanguageCreateRequest,
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
    user: dict[str, Any] = Depends(require_tenant),
) -> LanguageResponse:
    repo = LanguageRepository(db)
    doc = await repo.create(body.name, body.code, body.direction, body.enabled)
    return LanguageResponse.from_doc(doc)


@router.put("/{language_id}", summary="Update a language")
async def update_language(
    language_id: str,
    body: LanguageUpdateRequest,
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
    user: dict[str, Any] = Depends(require_tenant),
) -> LanguageResponse:
    repo = LanguageRepository(db)
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    await repo.update(language_id, fields)
    doc = await repo.find_by_id(language_id)
    if doc is None:
        raise NotFoundError("Language", language_id)
    return LanguageResponse.from_doc(doc)


@router.delete("/{language_id}", summary="Delete a language")
async def delete_language(
    language_id: str,
    db: AsyncDatabase = Depends(get_db),  # type: ignore[type-arg]
    user: dict[str, Any] = Depends(require_tenant),
) -> StatusResponse:
    repo = LanguageRepository(db)
    await repo.delete(language_id)
    return StatusResponse(status="deleted")
