from __future__ import annotations

import logging
from typing import Any

import httpx

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)


class HexisClient:
    """Stateful client: owns the HTTP pool and the cached JWT."""

    def __init__(self) -> None:
        settings = get_settings()
        self._settings = settings
        self._base_url = settings.hexis_base_url
        self._http = httpx.AsyncClient(timeout=30.0)
        self._jwt: str | None = None

    async def aclose(self) -> None:
        await self._http.aclose()

    def clear_session_cache(self) -> None:
        self._jwt = None

    async def get_session(self) -> str:
        if self._jwt:
            return self._jwt
        res = await self._http.post(
            f"{self._base_url}/login.php",
            data={"ph": self._settings.hexis_mobile, "pw": self._settings.hexis_password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        res.raise_for_status()
        try:
            body = res.json()
        except ValueError:
            body = {}
        token = body.get("accessToken") if isinstance(body, dict) else None
        if not token:
            raise RuntimeError(f"Hexis login failed: {res.text[:200]}")
        self._jwt = token
        return token

    async def list_content(self, aid: str) -> list[dict[str, Any]]:
        res = await self._http.get(
            f"{self._base_url}/common-content-api.php",
            params={"aid": aid},
            headers={"Authorization": await self.get_session()},
        )
        res.raise_for_status()
        return res.json()

    async def get_subjects(self) -> dict[str, str]:
        """Map subject id -> display name (e.g. {"3": "Science"})."""
        res = await self._http.get(
            f"{self._base_url}/common.php",
            params={"subjects": "true"},
            headers={"Authorization": await self.get_session()},
        )
        res.raise_for_status()
        return {str(s["id"]): s["subject"] for s in res.json().get("subjects", [])}


_client: HexisClient | None = None


def get_hexis_client() -> HexisClient:
    """Return the process-wide HexisClient singleton (reuses the HTTP pool)."""
    global _client  # noqa: PLW0603
    if _client is None:
        _client = HexisClient()
    return _client
