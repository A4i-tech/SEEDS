from __future__ import annotations

from fastapi import APIRouter

from app.services.language_registry import Language
from app.services.language_service import list_languages as get_supported_languages

router = APIRouter(prefix="/v1", tags=["Languages"])


@router.get("/languages", summary="List all languages the platform supports")
async def list_languages() -> dict[str, list[Language]]:
    return {"languages": get_supported_languages()}
