from __future__ import annotations

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.repositories.project_repository import ProjectRepository
from app.repositories.translation_repository import TranslationRepository
from app.repositories.website_repository import WebsiteRepository


class AnalyticsService:
    def __init__(self, db: AsyncDatabase) -> None:
        self._translations = TranslationRepository(db)
        self._projects = ProjectRepository(db)
        self._websites = WebsiteRepository(db)

    async def get_summary(self, site_id: str | None = None, tenant_id: str | None = None) -> dict[str, int]:
        if site_id is not None and tenant_id is not None:
            website = await self._websites.find_by_site_id(site_id)
            if not website or website.get("tenant_id") != tenant_id:
                raise NotFoundError("website", site_id)
        summary = await self._translations.get_analytics(site_id)
        summary["totalProjects"] = await self._projects.count()
        summary["totalSites"] = await self._websites.count()
        return summary


def get_analytics_service(
    db: AsyncDatabase = Depends(get_db),
) -> AnalyticsService:
    return AnalyticsService(db)
