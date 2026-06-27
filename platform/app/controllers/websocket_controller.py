"""
WebSocket controller — inbound audio WebSocket from Vonage.

Preserves EXACT URL path from ConferenceV2:
  WS /websocket/{conference_id}

Security (Phase 11):
  1. WS-Control-Secret header must match settings.ws_control_secret (if set).
  2. conference_id must exist in the conference_repository and not be ended.
  Both checks reject with WS close code 1008 (Policy Violation).
"""

from __future__ import annotations

import asyncio
import hmac
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

# Singleton hold detector to cache embeddings across connections
_hold_detector_instance: Any | None = None
_hold_detector_lock = asyncio.Lock()


async def _get_hold_detector() -> Any | None:
    global _hold_detector_instance
    if _hold_detector_instance is None:
        async with _hold_detector_lock:
            if _hold_detector_instance is None:
                try:
                    from app.services.audio.hold_detector import HoldDetector  # noqa: PLC0415

                    _hold_detector_instance = await HoldDetector.create()
                except Exception as exc:
                    logger.error("websocket_ctrl: hold detector init failed — %s", exc)
                    return None
    return _hold_detector_instance


def _get_conference_manager() -> Any:
    from app.platform.lifespan import get_conference_manager  # noqa: PLC0415
    return get_conference_manager()


# ---------------------------------------------------------------------------
# Security helpers
# ---------------------------------------------------------------------------

def _check_control_secret(websocket: WebSocket) -> bool:
    """Return True if the WS-Control-Secret header is valid (or enforcement is disabled).

    Enforcement is disabled when settings.ws_control_secret is empty/unset,
    which allows local development without a secret.
    """
    from app.platform.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    expected = settings.ws_control_secret
    if not expected:
        # Not configured — skip enforcement (dev mode)
        return True

    provided = websocket.headers.get("WS-Control-Secret", "")
    return hmac.compare_digest(provided, expected)


async def _check_conference_exists(conference_id: str) -> bool:
    """Return True if conference_id maps to an active (non-ended) conference in MongoDB.

    Fail-closed: DB errors deny the connection and are logged separately from
    NotFound so operators can distinguish transient infrastructure failures from
    legitimate rejections.
    """
    from app.platform.database import get_database  # noqa: PLC0415
    from app.repositories.conference_repository import ConferenceRepository  # noqa: PLC0415

    db = get_database()
    repo = ConferenceRepository(db)
    try:
        state = await repo.find_by_conference_id(conference_id)
    except Exception as exc:
        logger.error(
            "websocket_ctrl: DB error during conference lookup conf_id=%s — %s (fail-closed)",
            conference_id, exc,
        )
        return False

    if state is None:
        logger.debug("websocket_ctrl: conference not found conf_id=%s", conference_id)
        return False
    if state.ended_at is not None or not state.is_running:
        logger.debug("websocket_ctrl: conference inactive conf_id=%s", conference_id)
        return False
    return True


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/websocket/{conference_id}")
async def websocket_endpoint(websocket: WebSocket, conference_id: str) -> None:
    """Accept inbound audio WebSocket from Vonage for a conference call.

    Security checks (both run before accept()):
      1. WS-Control-Secret header must match settings.ws_control_secret (if configured).
      2. conference_id must exist and be active in the conference_repository.
    """
    # --- 1. Control secret check ---
    if not _check_control_secret(websocket):
        logger.warning(
            "websocket: invalid WS-Control-Secret for conf_id=%s, closing 1008",
            conference_id,
        )
        await websocket.close(code=1008)
        return

    # --- 2. Conference ID allowlist ---
    try:
        exists = await asyncio.wait_for(_check_conference_exists(conference_id), timeout=2.0)
    except TimeoutError:
        logger.warning("websocket: conference lookup timed out conf_id=%s, closing 1008", conference_id)
        await websocket.close(code=1008)
        return
    if not exists:
        logger.warning(
            "websocket: conference not found or ended conf_id=%s, closing 1008",
            conference_id,
        )
        await websocket.close(code=1008)
        return

    conf_mgr = _get_conference_manager()
    conf = conf_mgr.get_conference(conference_id)
    if conf is None:
        logger.warning("websocket: conference not in manager conf_id=%s, closing 1008", conference_id)
        await websocket.close(code=1008)
        return

    from app.platform.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    await websocket.accept()
    conf.set_websocket(websocket)
    logger.info("websocket: accepted conf_id=%s", conference_id)

    transcriber: Any | None = None
    hold_detector: Any | None = None
    capture_session: Any | None = None

    try:
        from app.services.audio.transcriber import AudioTranscriber  # noqa: PLC0415

        transcriber = AudioTranscriber()
    except Exception as exc:
        logger.error("websocket: transcriber init failed conf_id=%s — %s", conference_id, exc)

    if settings.audio_analysis_enabled:
        hold_detector = await _get_hold_detector()

    if settings.audio_capture_enabled:
        try:
            from app.services.audio.audio_capture import AudioCaptureService  # noqa: PLC0415

            capture_session = AudioCaptureService(conference_id, settings=settings)
        except Exception as exc:
            logger.error("websocket: audio capture init failed conf_id=%s — %s", conference_id, exc)

    from app.services.audio.websocket_audio_processor import (
        handle_incoming_message,  # noqa: PLC0415
    )

    try:
        while True:
            msg = await websocket.receive()
            should_continue = await handle_incoming_message(
                msg, conf, transcriber, hold_detector, conference_id, capture_session
            )
            if not should_continue:
                break
    except WebSocketDisconnect:
        logger.info("websocket: client disconnected conf_id=%s", conference_id)
    except Exception as exc:
        logger.exception("websocket: error in loop conf_id=%s — %s", conference_id, exc)
    finally:
        if capture_session:
            uploaded_url = await capture_session.finalize()
            if uploaded_url:
                logger.info("websocket: audio uploaded conf_id=%s", conference_id)
        conf.set_websocket(None)
