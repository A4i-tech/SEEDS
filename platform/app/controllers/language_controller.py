from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.language_service import list_languages as get_supported_languages


class LanguageEntry(BaseModel):
    code: str
    standard: str
    name: str


class LanguageListResponse(BaseModel):
    languages: list[LanguageEntry]


router = APIRouter(prefix="/v1", tags=["Languages"])


@router.get("/languages", response_model=LanguageListResponse, summary="List all languages the platform supports")
async def list_languages() -> LanguageListResponse:
    return LanguageListResponse(languages=get_supported_languages())
