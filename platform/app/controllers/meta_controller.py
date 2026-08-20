"""Meta (Seeds AI assistant) routes — /meta/*.

Ported from backend-server/src/controllers/meta.controller.js +
routes/metaCaller.js.

Pipeline per command (see app.services.meta_service.process_command):
  Phase 1: reason_about_command   (Azure OpenAI)
  Phase 2: plan_commands          (Azure OpenAI)
  Phase 3: execute_commands       (HTTP self-calls with caller's bearer token)
  Phase 4: generate_spoken_summary + synthesize_speech (Azure OpenAI + TTS)

SECURITY:
  - /voice-command, /transcribe, /text-command require a teacher token.
  - /tts-prompt is public (static persona audio), mirroring metaCaller.js.
  - The caller's bearer token is forwarded verbatim to self-calls only.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import ValidationError as PydanticValidationError

from app.models.requests.meta_requests import CommandContext, TextCommandRequest, TtsPromptRequest
from app.models.responses.meta import ProcessCommandResponse, TranscriptResponse, TtsPromptResponse
from app.platform.auth.dependencies import get_db, require_role
from app.services import meta_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meta", tags=["Meta"])

_require_teacher = require_role("teacher", "content_creator")

_MAX_AUDIO_BYTES = 25 * 1024 * 1024  # multer limit in metaCaller.js


def _get_auth_token(request: Request) -> str:
    return request.headers.get("authorization", "").removeprefix("Bearer ")


def _get_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


async def _read_audio(audio: UploadFile) -> bytes:
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="No audio file provided")
    if len(data) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large (max 25 MB)")
    return data


def _parse_context(context: str | None) -> CommandContext:
    try:
        return CommandContext.from_raw(context)
    except (ValueError, PydanticValidationError) as exc:
        raise HTTPException(status_code=400, detail="Invalid context JSON") from exc


@router.post("/voice-command", summary="Execute a voice command")
async def voice_command(
    request: Request,
    audio: UploadFile = File(...),
    context: str | None = Form(default=None),
    current_user: dict[str, Any] = Depends(_require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> ProcessCommandResponse:
    audio_bytes = await _read_audio(audio)
    transcript = await meta_service.transcribe_audio(audio_bytes)
    logger.info("meta: transcript=%r", transcript)
    if not transcript.strip():
        raise HTTPException(status_code=400, detail="Could not transcribe audio")

    ctx = _parse_context(context)
    user_info = await meta_service.build_user_info(current_user, db, ctx)
    return await meta_service.process_command(
        transcript, user_info, db, _get_auth_token(request), _get_base_url(request)
    )


@router.post("/transcribe", summary="Transcribe audio only (no execution)")
async def transcribe(
    audio: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(_require_teacher),
) -> TranscriptResponse:
    audio_bytes = await _read_audio(audio)
    transcript = await meta_service.transcribe_audio(audio_bytes)
    return TranscriptResponse(transcript=transcript)


@router.post("/text-command", summary="Execute a text command (skips transcription)")
async def text_command(
    request: Request,
    body: TextCommandRequest,
    current_user: dict[str, Any] = Depends(_require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> ProcessCommandResponse:
    if not body.command:
        raise HTTPException(status_code=400, detail="No command provided")
    logger.info("meta:text command=%r", body.command)

    user_info = await meta_service.build_user_info(current_user, db, body.context)
    return await meta_service.process_command(
        body.command, user_info, db, _get_auth_token(request), _get_base_url(request)
    )


# Public — static persona prompts only, no user data (mirrors metaCaller.js)
@router.post("/tts-prompt", summary="Get TTS audio for a static Seeds AI prompt")
async def tts_prompt(body: TtsPromptRequest) -> TtsPromptResponse:
    result = await meta_service.get_tts_prompt(body.type)
    if result is None:
        raise HTTPException(status_code=400, detail=f"Unknown prompt type: {body.type}")
    return result
