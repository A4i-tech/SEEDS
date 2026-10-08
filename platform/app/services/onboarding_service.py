from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.models.responses.onboarding import ProjectResponse, WebsiteResponse
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import (
    ConfigurationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.platform.settings import get_settings
from app.repositories.project_repository import ProjectRepository
from app.repositories.website_repository import WebsiteRepository

# Matches a plain hostname (e.g. "example.com"): dot-separated labels, each
# 1-63 chars of letters/digits/hyphens, no leading/trailing hyphen per label.
_DOMAIN_RE = re.compile(
    r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63}(?<!-))+$"
)


def _validate_domain(domain: str) -> None:
    if not domain or not _DOMAIN_RE.match(domain):
        raise ValidationError(f"Invalid domain: {domain!r}")


def _normalize_domains(domains: list[str]) -> list[str]:
    normalized = list(dict.fromkeys(domain.strip().lower() for domain in domains))
    for domain in normalized:
        _validate_domain(domain)
    return normalized


class OnboardingService:
    def __init__(self, db: AsyncDatabase) -> None:
        self._projects = ProjectRepository(db)
        self._websites = WebsiteRepository(db)

    async def create_project(
        self,
        tenant_id: str,
        name: str,
        description: str = "",
        source_language: str = "English",
        status: str = "Active",
    ) -> ProjectResponse:
        project = await self._projects.create(tenant_id, name, description, source_language, status)
        return ProjectResponse.from_doc(project)

    async def list_projects(self, tenant_id: str) -> list[ProjectResponse]:
        projects = await self._projects.find_all_by_tenant(tenant_id)
        return [ProjectResponse.from_doc(project) for project in projects]

    async def update_project(self, project_id: str, tenant_id: str, fields: dict[str, Any]) -> ProjectResponse:
        project = await self._projects.find_by_id_and_tenant(project_id, tenant_id)
        if project is None:
            raise NotFoundError("Project", project_id)

        updated = await self._projects.update(project_id, tenant_id, fields)
        return ProjectResponse.from_doc(updated)

    async def delete_project(self, project_id: str, tenant_id: str) -> None:
        deleted = await self._projects.delete(project_id, tenant_id)
        if not deleted:
            raise NotFoundError("Project", project_id)

    async def register_website(
        self,
        tenant_id: str,
        project_id: str | None,
        domain: str,
        name: str = "",
        status: str = "Active",
        languages: list[dict[str, Any]] | None = None,
        additional_domains: list[str] | None = None,
    ) -> WebsiteResponse:
        _validate_domain(domain)
        additional_domains = _normalize_domains(additional_domains or [])
        self._base_url()

        if project_id is not None:
            project = await self._projects.find_by_id_and_tenant(project_id, tenant_id)
            if project is None:
                raise NotFoundError("Project", project_id)

        await self._ensure_domains_unclaimed([domain, *additional_domains])

        site_id = str(uuid.uuid4())
        try:
            website = await self._websites.create(
                tenant_id, project_id, domain, site_id, name, status, languages, additional_domains
            )
        except DuplicateKeyError as exc:
            raise ConflictError(f"Website with domain {domain!r}") from exc
        return WebsiteResponse.from_doc(website, api_base=self._base_url())

    async def get_website(self, website_id: str, tenant_id: str) -> WebsiteResponse:
        website = await self._websites.find_by_id_and_tenant(website_id, tenant_id)
        if website is None:
            raise NotFoundError("Website", website_id)
        return WebsiteResponse.from_doc(website, api_base=self._base_url())

    async def list_websites(self, tenant_id: str, project_id: str | None = None) -> list[WebsiteResponse]:
        if project_id:
            websites = await self._websites.find_by_project_and_tenant(project_id, tenant_id)
        else:
            websites = await self._websites.find_all_by_tenant(tenant_id)
        return [WebsiteResponse.from_doc(website) for website in websites]

    async def update_website(self, website_id: str, tenant_id: str, fields: dict[str, Any]) -> WebsiteResponse:
        self._base_url()

        website = await self._websites.find_by_id_and_tenant(website_id, tenant_id)
        if website is None:
            raise NotFoundError("Website", website_id)

        if "domain" in fields and fields["domain"]:
            _validate_domain(fields["domain"])
        if "additional_domains" in fields:
            fields = {**fields, "additional_domains": _normalize_domains(fields["additional_domains"])}
        claimed = [fields["domain"]] if fields.get("domain") else []
        await self._ensure_domains_unclaimed(claimed + fields.get("additional_domains", []), str(website["_id"]))

        updated = await self._websites.update(website_id, tenant_id, fields)
        return WebsiteResponse.from_doc(updated, api_base=self._base_url())

    async def delete_website(self, website_id: str, tenant_id: str) -> None:
        deleted = await self._websites.delete(website_id, tenant_id)
        if not deleted:
            raise NotFoundError("Website", website_id)

    async def _ensure_domains_unclaimed(self, domains: list[str], own_website_id: str | None = None) -> None:
        for domain in domains:
            existing = await self._websites.find_by_domain(domain)
            if existing is not None and str(existing["_id"]) != own_website_id:
                raise ConflictError(f"Website with domain {domain!r}")

    def _base_url(self) -> str:
        base_url = get_settings().base_url.rstrip("/")
        if not base_url:
            raise ConfigurationError("BASE_URL must be set to generate an SDK snippet")
        return base_url


def get_onboarding_service(
    db: AsyncDatabase = Depends(get_db),
) -> OnboardingService:
    return OnboardingService(db)
