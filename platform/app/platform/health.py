"""
Health-check endpoint - always mounted regardless of APP_MODE.

SECURITY: In production the version is omitted from the response to avoid
leaking internal build metadata to external callers.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.platform.settings import get_settings

health_router = APIRouter(tags=["health"])


@health_router.get("/health", response_class=JSONResponse)
async def health_check() -> dict:
    """Return platform health status."""
    settings = get_settings()

    payload: dict = {
        "status": "ok",
        "mode": settings.app_mode,
        "env": settings.env,
    }

    # Omit version in production to avoid leaking build metadata
    if settings.env != "production":
        payload["version"] = settings.version

    return payload
