from __future__ import annotations

import hmac
from collections.abc import Callable
from datetime import UTC, datetime
from hashlib import sha256

from fastapi import Depends
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError as PydanticValidationError
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content import Content
from app.models.device_push import DevicePushRecord, DeviceType
from app.models.requests.device_push_requests import DevicePushCallback, DevicePushRequest
from app.models.responses.device_push import (
    DevicePushDevice,
    DevicePushResponse,
    DevicePushStatusResponse,
)
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import (
    AppError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from app.platform.settings import get_settings
from app.providers.blob_storage import get_blob_storage_provider
from app.providers.vembi_client import VembiClient
from app.repositories.content_repository import ContentRepository
from app.repositories.device_push_repository import DevicePushRepository


def _iris_file(content: Content) -> str:
    audio = content.audio_content[0]
    if not audio.duration_seconds:
        raise ValidationError("Content has no audio")
    return audio.audio_url


def _hexis_file(content: Content) -> str:
    if not content.text_file_url:
        raise ValidationError("Content has no text file")
    return content.text_file_url


_FILE_PICKERS: dict[DeviceType, Callable[[Content], str]] = {"iris": _iris_file, "hexis": _hexis_file}


class DevicePushService:
    def __init__(self, db: AsyncDatabase, vembi: VembiClient | None = None) -> None:
        self._content_repo = ContentRepository(db)
        self._push_repo = DevicePushRepository(db)
        self._vembi = vembi

    def _vembi_client(self) -> VembiClient:
        return self._vembi or VembiClient()

    async def push(self, tenant_id: str, body: DevicePushRequest) -> DevicePushResponse:
        vembi = self._vembi_client()
        doc = await self._content_repo.find_by_id_and_tenant(body.content_id, tenant_id)
        if not doc:
            raise NotFoundError("Content", body.content_id)
        content = Content.from_mongo(doc)
        if not content.is_processed:
            raise AppError("CONTENT_NOT_PROCESSED", "Content is not processed yet", 409)
        blob_url = _FILE_PICKERS[body.device_type](content)
        file_url = await get_blob_storage_provider().get_sas_url_from_blob_url(blob_url, expiry_hours=1)
        reply = await vembi.push(
            body.device_id,
            body.device_type,
            file_url,
            content.language,
            content.title.english,
            content.type,
        )
        await self._push_repo.insert(
            DevicePushRecord(
                source_id=reply.source_id,
                tenant_id=tenant_id,
                content_id=body.content_id,
                device_id=body.device_id,
                device_type=body.device_type,
                status="QUEUED",
                queued_at=datetime.now(UTC),
            )
        )
        return DevicePushResponse(source_id=reply.source_id, status="QUEUED")

    async def get_status(self, tenant_id: str, source_id: str) -> DevicePushStatusResponse:
        record = await self._push_repo.find_by_source_id(source_id, tenant_id)
        if not record:
            raise NotFoundError("Device push", source_id)
        if record.status == "QUEUED":
            reply = await self._vembi_client().get_status(source_id)
            record = await self._push_repo.update_status(source_id, reply.status, reply.last_synced_at)
        return DevicePushStatusResponse(
            source_id=record.source_id,
            status=record.status,
            last_synced_at=record.synced_at,
            devices=[
                DevicePushDevice(
                    device_type=record.device_type,
                    device_id=record.device_id,
                    status=record.status,
                    queued_at=record.queued_at,
                    synced_at=record.synced_at,
                )
            ],
        )

    async def apply_callback(self, raw_body: bytes, signature: str) -> DevicePushResponse:
        secret = get_settings().vembi_callback_secret
        expected = "sha256=" + hmac.new(secret.encode(), raw_body, sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise UnauthorizedError("Invalid signature")
        try:
            callback = DevicePushCallback.model_validate_json(raw_body)
        except PydanticValidationError as exc:
            raise RequestValidationError(exc.errors()) from exc
        record = await self._push_repo.update_status(callback.source_id, callback.status, callback.synced_at)
        if not record:
            raise NotFoundError("Device push", callback.source_id)
        return DevicePushResponse(source_id=record.source_id, status=record.status)


def get_device_push_service(db: AsyncDatabase = Depends(get_db)) -> DevicePushService:
    return DevicePushService(db)
