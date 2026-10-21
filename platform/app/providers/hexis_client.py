from __future__ import annotations

import functools

import httpx

from app.aggregators.hexis_types import HexisContentItem
from app.platform.settings import get_settings


class HexisClient:
    def __init__(self) -> None:
        settings = get_settings()
        self._settings = settings
        self._http = httpx.AsyncClient(timeout=30.0)
        self._jwt = ""

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get_session(self) -> str:
        if self._jwt:
            return self._jwt
        res = await self._http.post(
            f"{self._settings.hexis_base_url}/login.php",
            data={"ph": self._settings.hexis_mobile, "pw": self._settings.hexis_password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        res.raise_for_status()
        token = res.json().get("accessToken")
        if not token:
            raise RuntimeError(f"Hexis login failed: {res.text[:200]}")
        self._jwt = token
        return token

    async def _get(self, path: str, params: dict[str, str]) -> httpx.Response:
        async def send() -> httpx.Response:
            return await self._http.get(
                f"{self._settings.hexis_base_url}/{path}",
                params=params,
                headers={"Authorization": await self.get_session()},
            )

        res = await send()
        if res.status_code == httpx.codes.UNAUTHORIZED:
            self._jwt = ""
            res = await send()
        res.raise_for_status()
        return res

    async def list_content(self, aid: str) -> list[HexisContentItem]:
        return (await self._get("common-content-api.php", {"aid": aid})).json()

    async def get_subjects(self) -> dict[str, str]:
        res = await self._get("common.php", {"subjects": "true"})
        return {str(s["id"]): s["subject"] for s in res.json()["subjects"]}


@functools.cache
def get_hexis_client() -> HexisClient:
    return HexisClient()


async def close_hexis_client() -> None:
    if get_hexis_client.cache_info().currsize:
        await get_hexis_client().aclose()
        get_hexis_client.cache_clear()
