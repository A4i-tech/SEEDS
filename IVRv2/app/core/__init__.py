"""
Core module for application infrastructure.

This module exports the main components for application lifecycle management,
database access, state management, and dependency injection.
"""

from app.core.database import (
    MongoDBManager,
    MongoDBCollection,
    get_mongodb_manager,
    init_mongodb_manager,
    close_mongodb_manager,
)
from app.core.state import (
    AppState,
    get_app_state,
    set_app_state,
    clear_app_state,
)
from app.core.dependencies import (
    get_app_state as get_app_state_dependency,
    get_ongoing_fsm_collection,
    get_ivrv2_logs_collection,
    get_fsm_json_collection,
    get_radio_fsm_collection,
    get_calls_log_collection,
)


def get_lifespan():
    """Get the lifespan context manager.

    Uses late import to avoid circular dependencies.
    """
    from app.core.lifespan import lifespan

    return lifespan


__all__ = [
    # Database
    "MongoDBManager",
    "MongoDBCollection",
    "get_mongodb_manager",
    "init_mongodb_manager",
    "close_mongodb_manager",
    # State
    "AppState",
    "get_app_state",
    "set_app_state",
    "clear_app_state",
    # Lifespan
    "get_lifespan",
    # Dependencies
    "get_app_state_dependency",
    "get_ongoing_fsm_collection",
    "get_ivrv2_logs_collection",
    "get_fsm_json_collection",
    "get_radio_fsm_collection",
    "get_calls_log_collection",
]
