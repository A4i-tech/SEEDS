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
from app.models.device_push import DevicePushRecord, DeviceType, VembiPushRequest
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
from app.providers.vembi_client import VembiClient, get_vembi_client
from app.repositories.content_repository import ContentRepository
from app.repositories.device_push_repository import DevicePushRepository


def _file_url(content: Content) -> str:
    if not content.audio_content or not content.audio_content[0].duration_seconds:
        raise ValidationError("Content has no audio")
    return content.audio_content[0].audio_url


def _text_url(content: Content) -> str:
    if not content.file_url:
        raise ValidationError("Content has no text file")
    return content.file_url


_FILE_PICKERS: dict[DeviceType, Callable[[Content], str]] = {"iris": _file_url, "hexis": _text_url}


class DevicePushService:
    def __init__(self, db: AsyncDatabase, vembi: VembiClient) -> None:
        self._content_repo = ContentRepository(db)
        self._push_repo = DevicePushRepository(db)
        self._vembi = vembi

    async def push(self, tenant_id: str, body: DevicePushRequest, idempotency_key: str) -> DevicePushResponse:
        doc = await self._content_repo.find_by_id_and_tenant(body.content_id, tenant_id)
        if not doc:
            raise NotFoundError("Content", body.content_id)
        content = Content.from_mongo(doc)
        if not content.is_processed:
            raise AppError("CONTENT_NOT_PROCESSED", "Content is not processed yet", 409)
        blob_url = _FILE_PICKERS[body.device_type](content)
        file_url = await get_blob_storage_provider().get_sas_url_from_blob_url(blob_url, expiry_hours=1)
        reply = await self._vembi.push(
            VembiPushRequest(
                device_id=body.device_id,
                device_type=body.device_type,
                file_url=file_url,
                language=content.language,
                title=content.title.english,
            ),
            f"{tenant_id}:{idempotency_key}",
        )
        record = await self._push_repo.insert_if_absent(
            DevicePushRecord(
                source_id=reply.source_id,
                tenant_id=tenant_id,
                content_id=body.content_id,
                device_id=body.device_id,
                device_type=body.device_type,
                status="PROCESSING",
                queued_at=datetime.now(UTC),
            )
        )
        return DevicePushResponse(source_id=record.source_id, status=record.status)

    async def get_status(self, tenant_id: str, source_id: str) -> DevicePushStatusResponse:
        record = await self._push_repo.find_by_source_id_and_tenant(source_id, tenant_id)
        if not record:
            raise NotFoundError("Device push", source_id)
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
        if not hmac.compare_digest(expected.encode(), signature.encode()):
            raise UnauthorizedError("Invalid signature")
        try:
            callback = DevicePushCallback.model_validate_json(raw_body)
        except PydanticValidationError as exc:
            raise RequestValidationError(exc.errors()) from exc
        record = await self._push_repo.update_status(callback.source_id, callback.status, callback.synced_at)
        if not record:
            raise NotFoundError("Device push", callback.source_id)
        return DevicePushResponse(source_id=record.source_id, status=record.status)


def get_device_push_service(
    db: AsyncDatabase = Depends(get_db), vembi: VembiClient = Depends(get_vembi_client)
) -> DevicePushService:
    return DevicePushService(db, vembi)
