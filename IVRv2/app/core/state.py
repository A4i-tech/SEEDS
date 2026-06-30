"""
Application state management for FastAPI lifespan.

This module provides a centralized state container that holds all shared
resources initialized during application startup and cleaned up during shutdown.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from app.core.database import MongoDBManager, MongoDBCollection


@dataclass
class AppState:
    """Centralized application state container.

    Holds all shared resources that are initialized during application lifespan
    and need to be accessible across the application. This approach replaces
    global variables with a structured, testable state management pattern.
    """

    # MongoDB manager and collections
    mongodb_manager: Optional[MongoDBManager] = None
    ongoing_fsm_mongo: Optional[MongoDBCollection] = None
    ivrv2_logs_mongo: Optional[MongoDBCollection] = None
    fsm_json_mongo: Optional[MongoDBCollection] = None
    radio_fsm_mongo: Optional[MongoDBCollection] = None
    calls_log_mongo: Optional[MongoDBCollection] = None
    contents_v3_mongo: Optional[MongoDBCollection] = None
    comprehension_mongo: Optional[MongoDBCollection] = None
    daily_listening_usage_mongo: Optional[MongoDBCollection] = None

    # FSM state
    fsm: Dict[str, Any] = field(default_factory=dict)
    latest_fsm_id: Optional[str] = None

    # Processors
    call_webhook_processor: Optional[Any] = None
    dtmf_input_processor: Optional[Any] = None
    call_event_processor: Optional[Any] = None

    # WebSocket service for control connection
    websocket_service: Optional[Any] = None

    def initialize_collections(self) -> None:
        """Initialize MongoDB collections from the manager.

        Must be called after mongodb_manager is initialized.

        Raises:
            RuntimeError: If mongodb_manager is not initialized.
        """
        if self.mongodb_manager is None:
            raise RuntimeError("MongoDB manager must be initialized before collections")

        self.ongoing_fsm_mongo = self.mongodb_manager.get_collection("ongoingIVRState")
        self.ivrv2_logs_mongo = self.mongodb_manager.get_collection("ivrv2logs")
        self.fsm_json_mongo = self.mongodb_manager.get_collection("fsm")
        self.radio_fsm_mongo = self.mongodb_manager.get_collection("radio")
        self.calls_log_mongo = self.mongodb_manager.get_collection("callsLogs")
        self.contents_v3_mongo = self.mongodb_manager.get_collection("contentsV3")
        self.comprehension_mongo = self.mongodb_manager.get_collection("comprehension")
        self.daily_listening_usage_mongo = self.mongodb_manager.get_collection("dailyListeningUsage")


# Global app state instance - set during lifespan
_app_state: Optional[AppState] = None


def get_app_state() -> AppState:
    """Get the global application state.

    Returns:
        The initialized AppState instance.

    Raises:
        RuntimeError: If the app state has not been initialized.
    """
    if _app_state is None:
        raise RuntimeError(
            "App state not initialized. Ensure app lifespan has started."
        )
    return _app_state


def set_app_state(state: AppState) -> None:
    """Set the global application state.

    Called during application lifespan startup.

    Args:
        state: The AppState instance to set.
    """
    global _app_state
    _app_state = state


def clear_app_state() -> None:
    """Clear the global application state.

    Called during application lifespan shutdown.
    """
    global _app_state
    _app_state = None
