"""
SEEDS AI Controller — /meta/* routes.

Ported from:
  backend-server/src/routes/metaCaller.js
  backend-server/src/controllers/meta.controller.js

Routes:
  POST /meta/voice-command  [auth required]
  POST /meta/text-command   [auth required]
  POST /meta/transcribe     [auth required]
  POST /meta/tts-prompt     [public — needed pre-login for welcome audio]

SECURITY:
  - Auth token forwarded to self-calls; never logged.
  - Audio files capped at 25 MB.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.dependencies import get_current_user, get_db
from app.platform.settings import get_settings
from app.services import meta_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meta", tags=["AI Controller"])

_MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB


def _get_token(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    return auth.split(" ", 1)[1] if " " in auth else ""


def _get_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _build_user_info(user: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    return {
        "user_id": user.get("sub", ""),
        "tenant_id": user.get("tenant_id", ""),
        "school_id": user.get("school_id", ""),
        "phone_number": user.get("phoneNumber", "") or user.get("phone_number", ""),
        "name": user.get("name", "Teacher"),
        **context,
    }


async def _process_command(
    transcript: str,
    user_info: dict[str, Any],
    token: str,
    base_url: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any]:
    logger.info("meta: Phase 1 — reasoning")
    reasoning = await meta_service.reason_about_command(transcript, user_info, db)

    if reasoning.get("canAutoResolve") is False:
        logger.info("meta: canAutoResolve=false — short-circuit to TTS")
        spoken_summary = None
        audio_base64 = None
        try:
            explanation = (
                reasoning.get("unresolvedNote")
                or " Then ".join(s.get("description", "") for s in (reasoning.get("steps") or []))
                or reasoning.get("reasoning")
                or "I understand your question but cannot execute it automatically."
            )
            tts_result = await meta_service.generate_spoken_summary(
                transcript,
                [{"step": "explanation", "status": 200, "data": {"explanation": explanation}}],
            )
            spoken_summary = tts_result.get("spokenText") or explanation
            if spoken_summary:
                audio_base64 = await meta_service.synthesize_speech(spoken_summary)
        except Exception as exc:  # noqa: BLE001
            logger.warning("meta: TTS phase failed (non-blocking): %s", exc)
        return {
            "transcript": transcript,
            "reasoning": reasoning,
            "commands": [],
            "results": [],
            "spokenSummary": spoken_summary,
            "audioBase64": audio_base64,
        }

    logger.info("meta: Phase 2 — planning")
    plan = await meta_service.plan_commands(transcript, user_info, reasoning, db)
    normalized = meta_service.normalize_plan(plan)

    if normalized.get("error"):
        return {"transcript": transcript, "reasoning": reasoning, "error": normalized["error"]}

    if normalized.get("needsInput"):
        return {
            "transcript": transcript,
            "reasoning": reasoning,
            "commands": normalized["commands"],
            "needsInput": True,
            "message": "Some steps require additional input. Please review and confirm.",
        }

    logger.info("meta: Phase 3 — executing %d commands", len(normalized["commands"]))
    results = await meta_service.execute_commands(normalized["commands"], token, base_url)

    spoken_summary = None
    audio_base64 = None
    try:
        logger.info("meta: Phase 4 — spoken summary + TTS")
        tts_result = await meta_service.generate_spoken_summary(transcript, results)
        spoken_summary = tts_result.get("spokenText")
        if spoken_summary:
            audio_base64 = await meta_service.synthesize_speech(spoken_summary)
    except Exception as exc:  # noqa: BLE001
        logger.warning("meta: TTS phase failed (non-blocking): %s", exc)

    return {
        "transcript": transcript,
        "reasoning": reasoning,
        "commands": normalized["commands"],
        "results": results,
        "spokenSummary": spoken_summary,
        "audioBase64": audio_base64,
    }


# ---------------------------------------------------------------------------
# POST /meta/voice-command
# ---------------------------------------------------------------------------

@router.post("/voice-command", summary="Execute a voice command via Azure STT → LLM pipeline")
async def voice_command(
    request: Request,
    audio: UploadFile,
    context: str = "",  # JSON string; sent as a form field alongside the file
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    audio_bytes = await audio.read(_MAX_AUDIO_BYTES + 1)
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio file exceeds 25 MB limit")
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio file provided")

    import json  # noqa: PLC0415
    ctx: dict[str, Any] = {}
    if context:
        try:
            ctx = json.loads(context)
        except (ValueError, TypeError):
            pass

    logger.info("meta: received audio %d bytes", len(audio_bytes))
    transcript = await meta_service.transcribe_audio(audio_bytes)
    logger.info("meta: transcript=%r", transcript[:100] if transcript else "")

    user_info = _build_user_info(user, ctx)
    return await _process_command(transcript, user_info, _get_token(request), _get_base_url(request), db)


# ---------------------------------------------------------------------------
# POST /meta/transcribe
# ---------------------------------------------------------------------------

@router.post("/transcribe", summary="Transcribe audio only (no execution)")
async def transcribe(
    audio: UploadFile,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    audio_bytes = await audio.read(_MAX_AUDIO_BYTES + 1)
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio file exceeds 25 MB limit")
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio file provided")
    transcript = await meta_service.transcribe_audio(audio_bytes)
    return {"transcript": transcript}


# ---------------------------------------------------------------------------
# POST /meta/text-command
# ---------------------------------------------------------------------------

class _TextCommandBody(dict):
    pass


@router.post("/text-command", summary="Execute a text command (skips audio transcription)")
async def text_command(
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    body = await request.json()
    command: str = body.get("command", "")
    if not command:
        raise HTTPException(status_code=400, detail="No command provided")
    ctx: dict[str, Any] = body.get("context") or {}
    logger.info("meta: text command=%r", command[:100])
    user_info = _build_user_info(user, ctx)
    return await _process_command(command, user_info, _get_token(request), _get_base_url(request), db)


# ---------------------------------------------------------------------------
# POST /meta/tts-prompt  (PUBLIC — no auth)
# ---------------------------------------------------------------------------

@router.post("/tts-prompt", summary="Get TTS audio for a static Seeds AI prompt (public)")
async def tts_prompt(request: Request) -> dict[str, Any]:
    body = await request.json()
    prompt_type: str = body.get("type", "")
    result = await meta_service.get_tts_prompt(prompt_type)
    if result is None:
        raise HTTPException(status_code=400, detail=f"Unknown prompt type: {prompt_type!r}")
    return result
