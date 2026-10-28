from __future__ import annotations

from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI

from app.platform import lifespan as lifespan_mod
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)

ENSURE_INDEXES_TARGETS = [
    "app.repositories.website_repository.WebsiteRepository",
    "app.repositories.translation_repository.TranslationRepository",
    "app.repositories.translation_version_repository.TranslationVersionRepository",
    "app.repositories.translation_audit_repository.TranslationAuditRepository",
    "app.repositories.content_job_repository.ContentJobRepository",
    "app.repositories.textbook_remediation_repository.TextbookRemediationRepository",
]


async def _run_lifespan(init_mock: AsyncMock) -> None:
    settings = MagicMock(app_mode="api", env="development", version="0.1.0")
    with ExitStack() as stack:
        stack.enter_context(patch("app.platform.lifespan.get_settings", return_value=settings))
        stack.enter_context(patch("app.platform.lifespan.init_database", new=AsyncMock()))
        stack.enter_context(
            patch("app.platform.lifespan.get_database", return_value=MagicMock())
        )
        stack.enter_context(patch("app.platform.lifespan.close_database", new=AsyncMock()))
        stack.enter_context(patch("app.platform.lifespan.close_subodha_client", new=AsyncMock()))
        stack.enter_context(patch("app.platform.lifespan._init_conference_manager", return_value=None))
        stack.enter_context(
            patch("app.providers.service_bus.service_bus_provider.initialize", new=init_mock)
        )
        stack.enter_context(
            patch(
                "app.repositories.textbook_remediation_repository.TextbookRemediationRepository.reconcile_interrupted_jobs",
                new=AsyncMock(return_value=0),
            )
        )
        for target in ENSURE_INDEXES_TARGETS:
            stack.enter_context(patch(f"{target}.ensure_indexes", new=AsyncMock()))
        stack.enter_context(
            patch.object(ContentAggregatorSyncJobRepository, "ensure_indexes", new=AsyncMock())
        )
        stack.enter_context(
            patch.object(
                ContentAggregatorSyncJobRepository,
                "reconcile_interrupted_jobs",
                new=AsyncMock(return_value=0),
            )
        )
        async with lifespan_mod.lifespan(FastAPI()):
            pass


@pytest.mark.asyncio
async def test_api_mode_initializes_provider():
    init_mock = AsyncMock()
    await _run_lifespan(init_mock)
    init_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_api_mode_init_failure_aborts_startup():
    init_mock = AsyncMock(side_effect=RuntimeError("sb down"))
    with pytest.raises(RuntimeError, match="sb down"):
        await _run_lifespan(init_mock)
