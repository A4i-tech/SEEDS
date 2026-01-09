"""
FastAPI dependency injection providers.

This module provides dependency injection functions for accessing
application resources in route handlers.
"""

from typing import TYPE_CHECKING

from fastapi import Depends, Request

if TYPE_CHECKING:
    from app.core.state import AppState
    from app.core.database import MongoDBCollection


def get_app_state(request: Request) -> "AppState":
    """Dependency to get the application state from request.

    Args:
        request: The FastAPI request object.

    Returns:
        The AppState instance stored in app.state.

    Raises:
        RuntimeError: If app state is not initialized.
    """
    state = getattr(request.app.state, "app_state", None)
    if state is None:
        raise RuntimeError("App state not initialized")
    return state


def get_ongoing_fsm_collection(
    state: "AppState" = Depends(get_app_state),
) -> "MongoDBCollection":
    """Dependency to get the ongoingIVRState MongoDB collection."""
    if state.ongoing_fsm_mongo is None:
        raise RuntimeError("ongoing_fsm_mongo collection not initialized")
    return state.ongoing_fsm_mongo


def get_ivrv2_logs_collection(
    state: "AppState" = Depends(get_app_state),
) -> "MongoDBCollection":
    """Dependency to get the ivrv2logs MongoDB collection."""
    if state.ivrv2_logs_mongo is None:
        raise RuntimeError("ivrv2_logs_mongo collection not initialized")
    return state.ivrv2_logs_mongo


def get_fsm_json_collection(
    state: "AppState" = Depends(get_app_state),
) -> "MongoDBCollection":
    """Dependency to get the fsm MongoDB collection."""
    if state.fsm_json_mongo is None:
        raise RuntimeError("fsm_json_mongo collection not initialized")
    return state.fsm_json_mongo


def get_radio_fsm_collection(
    state: "AppState" = Depends(get_app_state),
) -> "MongoDBCollection":
    """Dependency to get the radio MongoDB collection."""
    if state.radio_fsm_mongo is None:
        raise RuntimeError("radio_fsm_mongo collection not initialized")
    return state.radio_fsm_mongo


def get_calls_log_collection(
    state: "AppState" = Depends(get_app_state),
) -> "MongoDBCollection":
    """Dependency to get the callsLogs MongoDB collection."""
    if state.calls_log_mongo is None:
        raise RuntimeError("calls_log_mongo collection not initialized")
    return state.calls_log_mongo
