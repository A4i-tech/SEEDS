from __future__ import annotations

from fastapi import APIRouter

from app.services.language_registry import Language, SUPPORTED_LANGUAGES

router = APIRouter(prefix="/v1", tags=["Languages"])


@router.get("/languages", summary="List supported languages (static SDK registry)")
async def list_supported_languages() -> dict[str, list[Language]]:
    return {"languages": SUPPORTED_LANGUAGES}
