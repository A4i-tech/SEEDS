"""
Application lifespan: startup / shutdown hooks.

Startup:
  - Always:   init_database(), init conference_manager
  - consumer / all mode: start all consumers as asyncio background tasks
Shutdown:
  - Cancel & await all consumer tasks
  - close_database(), close conference_manager redis
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any, AsyncGenerator, Optional

from fastapi import FastAPI

from app.platform.database import close_database, init_database
from app.platform.settings import get_settings

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCallManager

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Conference manager singleton accessor
# ---------------------------------------------------------------------------

_conference_manager: Optional["ConferenceCallManager"] = None


def get_conference_manager() -> "ConferenceCallManager":
    """Return the active ConferenceCallManager singleton.

    Raises RuntimeError if called before lifespan startup.
    """
    if _conference_manager is None:
        raise RuntimeError("Conference manager is not initialized — call from lifespan startup")
    return _conference_manager


def _init_conference_manager() -> "ConferenceCallManager":
    """Construct and return the ConferenceCallManager using platform settings."""
    global _conference_manager

    settings = get_settings()

    from app.providers.vonage_api import VonageAPIProvider  # noqa: PLC0415
    from app.services.conference_service import ConferenceCallManager  # noqa: PLC0415

    import base64
    import os

    # Decode base64 private key if set
    private_key_raw = settings.vonage_application_private_key64
    private_key: str
    if private_key_raw:
        try:
            private_key = base64.b64decode(private_key_raw).decode()
        except Exception:
            private_key = private_key_raw  # Already PEM
    else:
        private_key = ""

    class _VonageAPIFactory:
        def create(self, conf_id: str, ws_url: str) -> VonageAPIProvider:
            return VonageAPIProvider(
                application_id=settings.vonage_application_id,
                private_key=private_key,
                vonage_number=settings.vonage_number,
                conf_id=conf_id,
                ws_server_url=ws_url,
                events_webhook_url=settings.events_webhook_ep,
                call_timeout_seconds=settings.vonage_call_timeout_seconds,
            )

    class _NoopConnectionManager:
        """Placeholder connection manager until SmartphoneConnectionManager is ported."""

        def __init__(self, conf_id: str) -> None:
            self.conf_id = conf_id

        async def connect(self, client: Any) -> dict:
            return {}

        async def disconnect(self, client: Any) -> dict:
            return {}

        async def send_message_to_client(self, client: Any, message: Any) -> None:
            pass

    class _NoopConnectionManagerFactory:
        def create(self, conf_id: str) -> _NoopConnectionManager:
            return _NoopConnectionManager(conf_id)

    class _NoopStorageManager:
        """Placeholder storage manager (MongoDB integration in future phase)."""

        async def save_state(self, conf_id: str, state: dict) -> None:
            pass

    _conference_manager = ConferenceCallManager(
        communication_api_factory=_VonageAPIFactory(),
        connection_manager_factory=_NoopConnectionManagerFactory(),
        storage_manager=_NoopStorageManager(),
        ws_base_url=settings.websocket_service_url,
    )
    logger.info("Conference manager initialized")
    return _conference_manager


def _make_consumer_tasks(conference_manager: Any) -> list[asyncio.Task]:  # type: ignore[type-arg]
    """
    Lazily import each consumer class and create asyncio tasks.
    Imports are deferred so that missing optional deps only fail at startup,
    not at module import time.
    """
    from app.platform.database import get_database  # noqa: PLC0415
    from app.consumers.audio_recording_consumer import AudioRecordingConsumer  # noqa: PLC0415
    from app.consumers.audio_analysis_consumer import AudioAnalysisConsumer  # noqa: PLC0415
    from app.consumers.call_event_consumer import CallEventConsumer  # noqa: PLC0415
    from app.consumers.dtmf_consumer import DtmfConsumer  # noqa: PLC0415
    from app.consumers.call_webhook_consumer import CallWebhookConsumer  # noqa: PLC0415
    from app.consumers.content_job_consumer import ContentJobConsumer  # noqa: PLC0415

    db = get_database()

    consumers: list[Any] = [
        AudioRecordingConsumer(),
        AudioAnalysisConsumer(conference_manager=conference_manager),
        CallEventConsumer(),
        DtmfConsumer(),
        CallWebhookConsumer(),
        ContentJobConsumer(db),
    ]

    tasks: list[asyncio.Task] = []  # type: ignore[type-arg]
    for consumer in consumers:
        task = asyncio.create_task(consumer.run(), name=type(consumer).__name__)
        tasks.append(task)
        logger.info("Started consumer task: %s", type(consumer).__name__)

    return tasks


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """FastAPI lifespan context manager."""
    settings = get_settings()

    # ------------------------------------------------------------------
    # STARTUP
    # ------------------------------------------------------------------
    await init_database()

    # Init conference manager (available in all modes)
    try:
        conf_mgr = _init_conference_manager()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Conference manager init failed (non-fatal in test mode): %s", exc)
        conf_mgr = None  # type: ignore[assignment]

    consumer_tasks: list[asyncio.Task] = []  # type: ignore[type-arg]
    if settings.app_mode in ("consumer", "all"):
        try:
            consumer_tasks = _make_consumer_tasks(conf_mgr)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to start consumers: %s", exc)
            raise

    app.state.consumer_tasks = consumer_tasks
    app.state.conference_manager = conf_mgr

    logger.info(
        "SEEDS Platform started (mode=%s, env=%s, version=%s)",
        settings.app_mode,
        settings.env,
        settings.version,
    )

    yield

    # ------------------------------------------------------------------
    # SHUTDOWN
    # ------------------------------------------------------------------
    if consumer_tasks:
        logger.info("Cancelling %d consumer task(s)…", len(consumer_tasks))
        for task in consumer_tasks:
            task.cancel()
        await asyncio.gather(*consumer_tasks, return_exceptions=True)
        logger.info("All consumer tasks stopped.")

    if conf_mgr is not None:
        try:
            await conf_mgr.close()
        except Exception as exc:
            logger.warning("Conference manager close failed: %s", exc)

    await close_database()
    logger.info("SEEDS Platform shut down.")
