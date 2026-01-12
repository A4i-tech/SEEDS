"""
FastAPI application lifespan management.

This module defines the lifespan context manager that handles application
startup and shutdown, replacing the deprecated on_event decorators.
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from app.core.database import (
    MongoDBManager,
    init_mongodb_manager,
    close_mongodb_manager,
)
from app.core.state import AppState, set_app_state, clear_app_state
from app.services.service_bus_manager import service_bus_manager
from app.core.telemetry import (
    initialize_telemetry,
    instrument_fastapi,
    shutdown_telemetry,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan context manager.

    Handles initialization of all application resources during startup
    and proper cleanup during shutdown.

    Args:
        app: The FastAPI application instance.

    Yields:
        None - resources are stored in app.state and global state.
    """
    # Late imports to avoid circular dependencies
    from app.workers.call_processor import (
        CallWebhookProcessor,
        DtmfInputProcessor,
        CallEventProcessor,
    )
    from app.fsm.insti import instantiate_from_latest_content

    # === STARTUP ===
    logger.info("[LIFESPAN] Starting application initialization...")

    # Initialize telemetry FIRST so all operations are traced
    logger.info("[LIFESPAN] Initializing Application Insights telemetry...")
    telemetry_enabled = initialize_telemetry()
    if telemetry_enabled:
        logger.info("[LIFESPAN] ✓ Telemetry initialized")
        # Instrument the FastAPI app
        instrument_fastapi(app)
    else:
        logger.warning("[LIFESPAN] Telemetry not available")

    # Create app state
    state = AppState()

    # Initialize MongoDB - use init_mongodb_manager to set global for backward compatibility
    logger.info("[LIFESPAN] Initializing MongoDB...")
    state.mongodb_manager = init_mongodb_manager()
    state.initialize_collections()
    logger.info("[LIFESPAN] ✓ MongoDB initialized")

    # Initialize FSM
    logger.info("[LIFESPAN] Initializing FSM from latest content...")
    updated_fsm = await instantiate_from_latest_content()
    state.fsm[updated_fsm.fsm_id] = updated_fsm
    state.latest_fsm_id = updated_fsm.fsm_id
    logger.info(f"[LIFESPAN] ✓ FSM initialized with ID: {state.latest_fsm_id}")

    # Initialize Service Bus Manager
    logger.info("[LIFESPAN] Initializing Service Bus Manager...")
    await service_bus_manager.initialize()
    logger.info("[LIFESPAN] ✓ Service Bus Manager initialized")

    # Create processors with state reference
    logger.info("[LIFESPAN] Creating processors...")
    state.call_webhook_processor = CallWebhookProcessor(state.fsm)
    state.dtmf_input_processor = DtmfInputProcessor(state.fsm)
    state.call_event_processor = CallEventProcessor(state.fsm)
    logger.info("[LIFESPAN] ✓ Processors created")

    # Update FSM references in processors
    state.call_webhook_processor.latest_fsm_id = state.latest_fsm_id
    state.dtmf_input_processor.latest_fsm_id = state.latest_fsm_id
    state.call_event_processor.latest_fsm_id = state.latest_fsm_id
    logger.info("[LIFESPAN] ✓ FSM references updated")

    # Start all processors in the background
    logger.info("[LIFESPAN] Starting background processors...")
    try:
        task1 = state.call_webhook_processor.start_background()
        logger.info(f"[LIFESPAN] ✓ CallWebhookProcessor started: {task1}")
        task2 = state.dtmf_input_processor.start_background()
        logger.info(f"[LIFESPAN] ✓ DtmfInputProcessor started: {task2}")
        task3 = state.call_event_processor.start_background()
        logger.info(f"[LIFESPAN] ✓ CallEventProcessor started: {task3}")
        logger.info("[LIFESPAN] ✓✓✓ All processors started successfully ✓✓✓")
    except Exception as e:
        logger.error(f"[LIFESPAN] ✗✗✗ ERROR starting processors: {e}")
        import traceback

        traceback.print_exc()
        raise

    # Store state in app.state for access in routes
    app.state.app_state = state

    # Also set global state for backward compatibility during migration
    set_app_state(state)

    logger.info("[LIFESPAN] ✓✓✓ Application startup complete ✓✓✓")

    yield  # Application runs here

    # === SHUTDOWN ===
    logger.info("[LIFESPAN] Starting graceful shutdown...")

    # Shutdown all processors with 30 second timeout each
    if state.call_webhook_processor:
        await state.call_webhook_processor.shutdown(timeout=30)
    if state.dtmf_input_processor:
        await state.dtmf_input_processor.shutdown(timeout=30)
    if state.call_event_processor:
        await state.call_event_processor.shutdown(timeout=30)

    # Close Service Bus
    await service_bus_manager.close()

    # Close MongoDB connection pool (also clears global)
    await close_mongodb_manager()

    # Clear global state
    clear_app_state()

    # Shutdown telemetry LAST to capture all shutdown operations
    if telemetry_enabled:
        shutdown_telemetry()

    logger.info("[LIFESPAN] ✓✓✓ Application shutdown complete ✓✓✓")
