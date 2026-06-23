"""Health check routes."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"message": "pong"}
