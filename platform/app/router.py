"""
Central API router — includes all controller routers.

Each controller owns exactly one APIRouter with its own prefix.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.controllers import (
    audit_controller,
    health_controller,
    call_controller,
    class_controller,
    # Calls (split from call_controller)
    conference_controller,
    # Content
    content_controller,
    ivr_controller,
    # Other
    ivr_structure_controller,
    ivr_webhook_controller,
    participants_controller,
    # Conference features
    playback_controller,
    school_admin_auth_controller,
    # School + Classes
    school_controller,
    student_controller,
    # Auth (split from auth_controller)
    teacher_auth_controller,
    # Users (split from users_controller)
    teacher_controller,
    tenant_auth_controller,
    user_controller,
    # Webhooks (split from webhook_controller)
    webhook_controller,
    websocket_controller,
)

api_router = APIRouter()

# Auth
api_router.include_router(teacher_auth_controller.router)
api_router.include_router(tenant_auth_controller.router)
api_router.include_router(school_admin_auth_controller.router)

# Users
api_router.include_router(teacher_controller.router)
api_router.include_router(student_controller.router)
api_router.include_router(user_controller.router)

# School + Classes
api_router.include_router(school_controller.router)
api_router.include_router(class_controller.router)

# Content
api_router.include_router(content_controller.router)
api_router.include_router(audit_controller.router)

# Calls
api_router.include_router(conference_controller.router)
api_router.include_router(call_controller.router)
api_router.include_router(ivr_controller.router)

# Conference features
api_router.include_router(playback_controller.router)
api_router.include_router(participants_controller.router)

# Webhooks
api_router.include_router(webhook_controller.router)
api_router.include_router(ivr_webhook_controller.router)

# Health
api_router.include_router(health_controller.router)

# Other
api_router.include_router(ivr_structure_controller.router)
api_router.include_router(websocket_controller.router)
