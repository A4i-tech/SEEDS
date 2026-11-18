from __future__ import annotations

from collections.abc import Mapping
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from app.controllers.content_controller import _require_content_write
from app.models.requests.device_push_requests import DevicePushRequest
from app.models.responses.device_push import DevicePushResponse, DevicePushStatusResponse
from app.services.device_push_service import DevicePushService, get_device_push_service

router = APIRouter(prefix="/devices/push", tags=["Device push"])


@router.post("", summary="Send a content item to Vembi for a Hexis or Iris device")
async def push_content(
    body: DevicePushRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")],
    user: Mapping[str, str] = Depends(_require_content_write),
    service: DevicePushService = Depends(get_device_push_service),
) -> DevicePushResponse:
    return await service.push(user["tenant_id"], body, idempotency_key)


@router.post("/callback", summary="Vembi reports the state of a send")
async def push_callback(
    request: Request,
    x_vembi_signature: Annotated[str, Header(alias="X-Vembi-Signature")],
    service: DevicePushService = Depends(get_device_push_service),
) -> DevicePushResponse:
    return await service.apply_callback(await request.body(), x_vembi_signature)


@router.get("/{source_id}/status", summary="State of a send as Vembi reports it")
async def get_push_status(
    source_id: str,
    user: Mapping[str, str] = Depends(_require_content_write),
    service: DevicePushService = Depends(get_device_push_service),
) -> DevicePushStatusResponse:
    return await service.get_status(user["tenant_id"], source_id)
