"""Analytics service — basic dashboard metrics derived from existing data.

Kept separate from TranslationService so that service stays focused on
translation workflows (ticket #436, Phase I).
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.platform.auth.dependencies import get_db
from app.repositories.project_repository import ProjectRepository
from app.repositories.translation_repository import TranslationRepository
from app.repositories.website_repository import WebsiteRepository


class AnalyticsService:
    def __init__(self, db: AsyncDatabase[Any]) -> None:
        self._translations = TranslationRepository(db)
        self._projects = ProjectRepository(db)
        self._websites = WebsiteRepository(db)

    async def get_summary(self, site_id: str | None = None) -> dict[str, int]:
        summary = await self._translations.get_analytics(site_id)
        summary["totalProjects"] = await self._projects.count()
        summary["totalSites"] = await self._websites.count()
        return summary


def get_analytics_service(
    db: AsyncDatabase[Any] = Depends(get_db),
) -> AnalyticsService:
    return AnalyticsService(db)
