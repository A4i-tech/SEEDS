from __future__ import annotations

from fastapi import APIRouter

from app.services.language_registry import SUPPORTED_LANGUAGES, Language

router = APIRouter(prefix="/v1", tags=["Languages"])


@router.get("/languages", summary="List all languages the platform supports")
async def list_languages() -> dict[str, list[Language]]:
    return {"languages": list(SUPPORTED_LANGUAGES)}
