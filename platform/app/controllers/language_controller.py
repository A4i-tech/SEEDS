"""Language registry - /v1/languages."""

from __future__ import annotations

from fastapi import APIRouter

from app.services.language_registry import SUPPORTED_LANGUAGES

router = APIRouter(prefix="/v1", tags=["Languages"])


@router.get("/languages", summary="List all languages the platform supports")
async def list_languages() -> dict[str, list[dict[str, str]]]:
    return {"languages": list(SUPPORTED_LANGUAGES)}
