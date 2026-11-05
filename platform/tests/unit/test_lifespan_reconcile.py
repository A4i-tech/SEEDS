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
    "app.repositories.integration_client_repository.IntegrationClientRepository",
    "app.repositories.user_refresh_token_repository.UserRefreshTokenRepository",
    "app.repositories.integration_token_repository.IntegrationTokenRepository",
    "app.repositories.content_aggregator_webhook_repository.ContentAggregatorWebhookRepository",
    "app.repositories.content_aggregator_webhook_delivery_repository.ContentAggregatorWebhookDeliveryRepository",
]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("app_mode", "expected_calls"),
    [("api", 0), ("consumer", 1), ("all", 1)],
)
async def test_lifespan_reconciles_sync_jobs_by_app_mode(app_mode, expected_calls):
    settings = MagicMock(app_mode=app_mode, env="development", version="0.1.0")

    with ExitStack() as stack:
        stack.enter_context(patch("app.platform.lifespan.get_settings", return_value=settings))
        stack.enter_context(patch("app.platform.lifespan.init_database", new=AsyncMock()))
        stack.enter_context(patch("app.platform.lifespan.get_database", return_value=MagicMock()))
        stack.enter_context(patch("app.platform.lifespan.close_database", new=AsyncMock()))
        stack.enter_context(patch("app.platform.lifespan.close_subodha_client", new=AsyncMock()))
        stack.enter_context(patch("app.platform.lifespan._init_conference_manager", return_value=None))
        stack.enter_context(patch("app.platform.lifespan._make_consumer_tasks", return_value=[]))
        stack.enter_context(
            patch("app.providers.service_bus.service_bus_provider.initialize", new=AsyncMock())
        )
        stack.enter_context(
            patch("app.providers.service_bus.service_bus_provider.close", new=AsyncMock())
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
        reconcile_mock = stack.enter_context(
            patch.object(
                ContentAggregatorSyncJobRepository,
                "reconcile_interrupted_jobs",
                new=AsyncMock(return_value=0),
            )
        )

        app = FastAPI()
        async with lifespan_mod.lifespan(app):
            pass

    assert reconcile_mock.await_count == expected_calls
