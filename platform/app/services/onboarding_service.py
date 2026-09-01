"""Onboarding service — project/website registration and SDK snippet generation.

Business logic only; MongoDB access goes through ProjectRepository /
WebsiteRepository (ticket #436).
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.platform.auth.dependencies import get_db
from app.platform.error_handling import ConflictError, NotFoundError, ValidationError
from app.platform.settings import get_settings
from app.repositories.project_repository import ProjectRepository
from app.repositories.website_repository import WebsiteRepository

_DOMAIN_RE = re.compile(
    r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63}(?<!-))+$"
)


def _validate_domain(domain: str) -> None:
    if not domain or not _DOMAIN_RE.match(domain):
        raise ValidationError(f"Invalid domain: {domain!r}")


def build_snippet(base_url: str, site_id: str) -> str:
    return (
        "<script\n"
        f'  src="{base_url}/sdk.js"\n'
        f'  data-site-id="{site_id}"\n'
        f'  data-api-base="{base_url}"\n'
        "  defer>\n"
        "</script>"
    )


class OnboardingService:
    def __init__(self, db: AsyncDatabase[Any]) -> None:
        self._projects = ProjectRepository(db)
        self._websites = WebsiteRepository(db)

    async def create_project(
        self,
        name: str,
        description: str = "",
        source_language: str = "English",
        status: str = "Active",
    ) -> dict[str, Any]:
        return await self._projects.create(name, description, source_language, status)

    async def list_projects(self) -> list[dict[str, Any]]:
        return await self._projects.find_all()

    async def update_project(self, project_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        project = await self._projects.find_by_id(project_id)
        if project is None:
            raise NotFoundError("Project", project_id)

        updated = await self._projects.update(project_id, fields)
        return updated

    async def delete_project(self, project_id: str) -> None:
        deleted = await self._projects.delete(project_id)
        if not deleted:
            raise NotFoundError("Project", project_id)

    async def register_website(
        self,
        project_id: str,
        domain: str,
        name: str = "",
        status: str = "Active",
    ) -> dict[str, Any]:
        _validate_domain(domain)

        project = await self._projects.find_by_id(project_id)
        if project is None:
            raise NotFoundError("Project", project_id)

        site_id = str(uuid.uuid4())
        try:
            return await self._websites.create(project_id, domain, site_id, name, status)
        except DuplicateKeyError as exc:
            raise ConflictError(f"Website with domain {domain!r}") from exc

    async def get_website(self, website_id: str) -> dict[str, Any]:
        website = await self._websites.find_by_id(website_id)
        if website is None:
            raise NotFoundError("Website", website_id)
        return website

    async def list_websites(self, project_id: str | None = None) -> list[dict[str, Any]]:
        if project_id:
            return await self._websites.find_by_project(project_id)
        return await self._websites.find_all()

    async def update_website(self, website_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        website = await self._websites.find_by_id(website_id)
        if website is None:
            raise NotFoundError("Website", website_id)

        if "domain" in fields and fields["domain"]:
            _validate_domain(fields["domain"])

        updated = await self._websites.update(website_id, fields)
        return updated

    async def delete_website(self, website_id: str) -> None:
        deleted = await self._websites.delete(website_id)
        if not deleted:
            raise NotFoundError("Website", website_id)

    def snippet_for(self, website: dict[str, Any]) -> str:
        settings = get_settings()
        return build_snippet(settings.translation_sdk_base_url, website["siteId"])


def get_onboarding_service(
    db: AsyncDatabase[Any] = Depends(get_db),
) -> OnboardingService:
    return OnboardingService(db)
