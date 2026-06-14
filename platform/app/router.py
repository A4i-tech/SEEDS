"""
Central API router - includes all controller routers.

Controllers are added here as phases are completed.
Phase labels indicate when each router will be un-commented.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.controllers import (
    auth_controller,
    audit_controller,
    call_controller,
    content_controller,
    ivr_structure_controller,
    participants_controller,
    playback_controller,
    school_controller,
    users_controller,
    webhook_controller,
    websocket_controller,
)

api_router = APIRouter()

# Phase 7
api_router.include_router(auth_controller.router)
api_router.include_router(users_controller.router)
# Phase 8
api_router.include_router(school_controller.router)
# Phase 8
api_router.include_router(content_controller.router)
api_router.include_router(audit_controller.router)
api_router.include_router(call_controller.router)
# Phase 9
api_router.include_router(playback_controller.router)
api_router.include_router(participants_controller.router)
api_router.include_router(webhook_controller.router)
api_router.include_router(websocket_controller.router)
# Phase 10
api_router.include_router(ivr_structure_controller.router)
