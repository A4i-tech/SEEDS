from __future__ import annotations

from fastapi import APIRouter

from app.models.responses.language import LanguageListResponse
from app.services.language_service import list_languages as get_supported_languages

router = APIRouter(prefix="/v1", tags=["Languages"])


@router.get("/languages", response_model=LanguageListResponse, summary="List all languages the platform supports")
async def list_languages() -> LanguageListResponse:
    return get_supported_languages()
