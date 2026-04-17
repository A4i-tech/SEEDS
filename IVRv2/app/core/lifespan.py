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
from app.core.telemetry import get_tracer
from app.application_logger.azure_app_insights import AppInsightsLogHandler

tracer = get_tracer(__name__)
logger = AppInsightsLogHandler.getLogger(__name__)


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

    # Create app state
    state = AppState()

    # Initialize MongoDB - use init_mongodb_manager to set global for backward compatibility
    logger.info("[LIFESPAN] Initializing MongoDB...")
    try:
        state.mongodb_manager = init_mongodb_manager()
        state.initialize_collections()
        logger.info("[LIFESPAN] ✓ MongoDB initialized")
    except ValueError as e:
        logger.error(f"[LIFESPAN] ✗ MongoDB configuration error: {e}")
        logger.error(
            "[LIFESPAN] Please check MONGO_DB_CONNECTION_STRING environment variable"
        )
        raise RuntimeError(f"Failed to initialize MongoDB: {e}") from e
    except Exception as e:
        logger.error(
            f"[LIFESPAN] ✗ MongoDB initialization failed: {type(e).__name__}: {e}"
        )
        logger.error(
            "[LIFESPAN] Application startup aborted due to MongoDB connection failure"
        )
        # Clean up any partial initialization
        await close_mongodb_manager()
        raise RuntimeError(f"Failed to initialize MongoDB: {e}") from e

    # Initialize FSM
    logger.info("[LIFESPAN] Initializing FSM from latest content...")
    try:
        updated_fsm = await instantiate_from_latest_content(
            contents_v3_collection=state.contents_v3_mongo
        )
        state.fsm[updated_fsm.fsm_id] = updated_fsm
        state.latest_fsm_id = updated_fsm.fsm_id
        logger.info(f"[LIFESPAN] ✓ FSM initialized with ID: {state.latest_fsm_id}")
    except Exception as e:
        logger.error(f"[LIFESPAN] ✗ FSM initialization failed: {type(e).__name__}: {e}")
        logger.error(
            "[LIFESPAN] Application startup aborted due to FSM initialization failure"
        )
        # Clean up MongoDB before re-raising
        await close_mongodb_manager()
        raise RuntimeError(f"Failed to initialize FSM: {e}") from e

    # Initialize Service Bus Manager
    logger.info("[LIFESPAN] Initializing Service Bus Manager...")
    try:
        await service_bus_manager.initialize()
        logger.info("[LIFESPAN] ✓ Service Bus Manager initialized")
    except Exception as e:
        logger.error(
            f"[LIFESPAN] ✗ Service Bus initialization failed: {type(e).__name__}: {e}"
        )
        logger.error(
            "[LIFESPAN] Application startup aborted due to Service Bus initialization failure"
        )
        # Clean up MongoDB before re-raising
        await close_mongodb_manager()
        raise RuntimeError(f"Failed to initialize Service Bus: {e}") from e

    # Initialize WebSocket Service for control connection
    logger.info("[LIFESPAN] Initializing WebSocket Service...")
    try:
        from app.services.websocket_service import get_websocket_service
        state.websocket_service = await get_websocket_service()
        logger.info("[LIFESPAN] ✓ WebSocket Service initialized (control connection established)")
    except Exception as e:
        logger.error(
            f"[LIFESPAN] ✗ WebSocket Service initialization failed: {type(e).__name__}: {e}"
        )
        logger.error(
            "[LIFESPAN] Application startup aborted due to WebSocket Service initialization failure"
        )
        # Clean up MongoDB and Service Bus before re-raising
        await service_bus_manager.close()
        await close_mongodb_manager()
        raise RuntimeError(f"Failed to initialize WebSocket Service: {e}") from e

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

    # Close WebSocket Service
    if state.websocket_service:
        logger.info("[LIFESPAN] Closing WebSocket Service...")
        await state.websocket_service.close()
        logger.info("[LIFESPAN] ✓ WebSocket Service closed")

    # Close Service Bus
    await service_bus_manager.close()

    # Close MongoDB connection pool (also clears global)
    await close_mongodb_manager()

    # Clear global state
    clear_app_state()

    logger.info("[LIFESPAN] ✓✓✓ Application shutdown complete ✓✓✓")
