from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.requests.meta_requests import TextCommandRequest, TtsPromptRequest
from app.models.responses.meta import ProcessCommandResponse, TranscriptResponse, TtsPromptResponse
from app.platform.auth.dependencies import get_db, require_role
from app.services import meta_service

router = APIRouter(prefix="/meta", tags=["Meta"])

_require_teacher = require_role("teacher", "content_creator")


def _get_auth_token(request: Request) -> str:
    return request.headers.get("authorization", "").removeprefix("Bearer ")


def _get_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


@router.post("/voice-command", summary="Execute a voice command")
async def voice_command(
    request: Request,
    audio: UploadFile = File(...),
    context: str = Form(...),
    current_user: dict[str, Any] = Depends(_require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> ProcessCommandResponse:
    return await meta_service.execute_voice_command(
        await audio.read(), context, current_user, db,
        _get_auth_token(request), _get_base_url(request),
    )


@router.post("/transcribe", summary="Transcribe audio only (no execution)")
async def transcribe(
    audio: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(_require_teacher),
) -> TranscriptResponse:
    transcript = await meta_service.transcribe_upload(await audio.read())
    return TranscriptResponse(transcript=transcript)


@router.post("/text-command", summary="Execute a text command (skips transcription)")
async def text_command(
    request: Request,
    body: TextCommandRequest,
    current_user: dict[str, Any] = Depends(_require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> ProcessCommandResponse:
    return await meta_service.execute_text_command(
        body.command, body.context, current_user, db,
        _get_auth_token(request), _get_base_url(request),
    )


@router.post("/tts-prompt", summary="Get TTS audio for a static Seeds AI prompt")
async def tts_prompt(body: TtsPromptRequest) -> TtsPromptResponse:
    result = await meta_service.get_tts_prompt(body.type)
    if result is None:
        raise HTTPException(status_code=400, detail=f"Unknown prompt type: {body.type}")
    return result
