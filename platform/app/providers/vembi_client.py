from __future__ import annotations

import httpx

from app.models.device_push import VembiPushReply, VembiStatusReply
from app.platform.error_handling import NotFoundError
from app.platform.settings import get_settings


class VembiClient:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def push(
        self,
        device_id: str,
        device_type: str,
        file_url: str,
        language: str,
        title: str,
        folder: str,
    ) -> VembiPushReply:
        response = await self._client.post(
            "/devices/push",
            json={
                "device_id": device_id,
                "device_type": device_type,
                "file_url": file_url,
                "language": language,
                "title": title,
                "folder": folder,
            },
        )
        response.raise_for_status()
        return VembiPushReply.model_validate(response.json())

    async def get_status(self, source_id: str) -> VembiStatusReply:
        response = await self._client.get(f"/devices/push/{source_id}/status")
        if response.status_code == 404:
            raise NotFoundError("Device push", source_id)
        response.raise_for_status()
        return VembiStatusReply.model_validate(response.json())


def get_vembi_client() -> VembiClient:
    settings = get_settings()
    return VembiClient(
        httpx.AsyncClient(
            base_url=settings.vembi_base_url,
            headers={"Authorization": f"Bearer {settings.vembi_api_key}"},
            timeout=settings.vembi_timeout_seconds,
        )
    )
