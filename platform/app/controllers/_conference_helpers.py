"""Shared helpers for conference controllers."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException


def get_conf_or_404(conference_id: str) -> Any:
    """Return the live conference object or raise 404."""
    from app.platform.lifespan import get_conference_manager  # noqa: PLC0415

    conf = get_conference_manager().get_conference(conference_id)
    if conf is None:
        raise HTTPException(status_code=404, detail="Conference not found")
    return conf
