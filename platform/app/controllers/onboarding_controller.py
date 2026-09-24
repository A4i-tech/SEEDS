from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from app.models.requests.onboarding_requests import (
    ProjectCreateRequest,
    ProjectUpdateRequest,
    WebsiteCreateRequest,
    WebsiteUpdateRequest,
)
from app.models.responses.common import StatusResponse
from app.models.responses.onboarding import ProjectResponse, WebsiteResponse
from app.platform.auth.dependencies import require_tenant
from app.services.onboarding_service import OnboardingService, get_onboarding_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Onboarding"])


def _tenant_id(user: dict[str, Any]) -> str:
    return user["sub"] if user.get("role") == "tenant" else user.get("tenant_id", "")


@router.post("/projects", summary="Register a new project")
async def create_project(
    body: ProjectCreateRequest,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> ProjectResponse:
    return await service.create_project(
        _tenant_id(user), body.name, body.description, body.source_language, body.status
    )


@router.get("/projects", summary="List registered projects")
async def list_projects(
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> list[ProjectResponse]:
    return await service.list_projects(_tenant_id(user))


@router.put("/projects/{project_id}", summary="Update a project")
async def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> ProjectResponse:
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    return await service.update_project(project_id, _tenant_id(user), fields)


@router.delete("/projects/{project_id}", summary="Delete a project")
async def delete_project(
    project_id: str,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> StatusResponse:
    await service.delete_project(project_id, _tenant_id(user))
    return StatusResponse(status="deleted")


@router.post("/websites", summary="Register a website (optionally under a project), generating its siteId and SDK snippet")
async def register_website(
    body: WebsiteCreateRequest,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> WebsiteResponse:
    languages = [lc.model_dump() for lc in body.languages] if body.languages is not None else None
    return await service.register_website(
        _tenant_id(user), body.project_id, body.domain, body.name, body.status, languages
    )


@router.get("/websites", summary="List registered websites, optionally filtered by project")
async def list_websites(
    projectId: str | None = None,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> list[WebsiteResponse]:
    return await service.list_websites(_tenant_id(user), projectId)


@router.get("/websites/{website_id}", summary="Get a registered website, including its SDK snippet")
async def get_website(
    website_id: str,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> WebsiteResponse:
    return await service.get_website(website_id, _tenant_id(user))


@router.put("/websites/{website_id}", summary="Update a website")
async def update_website(
    website_id: str,
    body: WebsiteUpdateRequest,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> WebsiteResponse:
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    return await service.update_website(website_id, _tenant_id(user), fields)


@router.delete("/websites/{website_id}", summary="Delete a website")
async def delete_website(
    website_id: str,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> StatusResponse:
    await service.delete_website(website_id, _tenant_id(user))
    return StatusResponse(status="deleted")
