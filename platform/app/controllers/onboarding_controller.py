"""Onboarding controller — /projects and /websites endpoints (ticket #436)."""

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
from app.models.responses.onboarding import ProjectResponse, WebsiteResponse
from app.platform.auth.dependencies import require_admin, require_admin_or_reviewer
from app.services.onboarding_service import OnboardingService, get_onboarding_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Onboarding"])


@router.post("/projects", summary="Register a new project")
async def create_project(
    body: ProjectCreateRequest,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    project = await service.create_project(
        body.name, body.description, body.sourceLanguage, body.status
    )
    return ProjectResponse.from_doc(project)


@router.get("/projects", summary="List registered projects")
async def list_projects(
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> list[dict[str, Any]]:
    projects = await service.list_projects()
    return [ProjectResponse.from_doc(project) for project in projects]


@router.put("/projects/{project_id}", summary="Update a project")
async def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    project = await service.update_project(project_id, fields)
    return ProjectResponse.from_doc(project)


@router.delete("/projects/{project_id}", summary="Delete a project")
async def delete_project(
    project_id: str,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, str]:
    await service.delete_project(project_id)
    return {"status": "deleted"}


@router.post("/websites", summary="Register a website under a project, generating its siteId and SDK snippet")
async def register_website(
    body: WebsiteCreateRequest,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    website = await service.register_website(body.projectId, body.domain, body.name, body.status)
    snippet = service.snippet_for(website)
    return WebsiteResponse.from_doc(website, snippet=snippet)


@router.get("/websites", summary="List registered websites, optionally filtered by project")
async def list_websites(
    projectId: str | None = None,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> list[dict[str, Any]]:
    websites = await service.list_websites(projectId)
    return [WebsiteResponse.from_doc(website) for website in websites]


@router.get("/websites/{website_id}", summary="Get a registered website, including its SDK snippet")
async def get_website(
    website_id: str,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> dict[str, Any]:
    website = await service.get_website(website_id)
    snippet = service.snippet_for(website)
    return WebsiteResponse.from_doc(website, snippet=snippet)


@router.put("/websites/{website_id}", summary="Update a website")
async def update_website(
    website_id: str,
    body: WebsiteUpdateRequest,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    website = await service.update_website(website_id, fields)
    snippet = service.snippet_for(website)
    return WebsiteResponse.from_doc(website, snippet=snippet)


@router.delete("/websites/{website_id}", summary="Delete a website")
async def delete_website(
    website_id: str,
    service: OnboardingService = Depends(get_onboarding_service),
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, str]:
    await service.delete_website(website_id)
    return {"status": "deleted"}
