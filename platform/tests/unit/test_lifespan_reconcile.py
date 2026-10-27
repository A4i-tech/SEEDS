from __future__ import annotations

from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI

from app.platform import lifespan as lifespan_mod
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("app_mode", "expected_calls"),
    [("api", 0), ("consumer", 1), ("all", 1)],
)
async def test_lifespan_reconciles_sync_jobs_by_app_mode(app_mode, expected_calls):
    settings = MagicMock(app_mode=app_mode, env="development", version="0.1.0")

    patchers = [
        patch("app.platform.lifespan.get_settings", return_value=settings),
        patch("app.platform.lifespan.init_database", new=AsyncMock()),
        patch("app.platform.lifespan.get_database", return_value=MagicMock()),
        patch("app.platform.lifespan.close_database", new=AsyncMock()),
        patch("app.platform.lifespan.close_subodha_client", new=AsyncMock()),
        patch("app.platform.lifespan._init_conference_manager", return_value=None),
        patch("app.platform.lifespan._make_consumer_tasks", return_value=[]),
        patch(
            "app.repositories.textbook_remediation_repository.TextbookRemediationRepository.reconcile_interrupted_jobs",
            new=AsyncMock(return_value=0),
        ),
        patch(
            "app.repositories.website_repository.WebsiteRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch(
            "app.repositories.translation_repository.TranslationRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch(
            "app.repositories.translation_version_repository.TranslationVersionRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch(
            "app.repositories.translation_audit_repository.TranslationAuditRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch(
            "app.repositories.content_job_repository.ContentJobRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch(
            "app.repositories.textbook_remediation_repository.TextbookRemediationRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch(
            "app.repositories.integration_client_repository.IntegrationClientRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch(
            "app.repositories.integration_token_repository.IntegrationTokenRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch(
            "app.repositories.user_refresh_token_repository.UserRefreshTokenRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch(
            "app.repositories.content_aggregator_webhook_repository.ContentAggregatorWebhookRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch(
            "app.repositories.content_aggregator_webhook_delivery_repository.ContentAggregatorWebhookDeliveryRepository.ensure_indexes",
            new=AsyncMock(),
        ),
        patch.object(ContentAggregatorSyncJobRepository, "ensure_indexes", new=AsyncMock()),
        patch.object(
            ContentAggregatorSyncJobRepository,
            "reconcile_interrupted_jobs",
            new=AsyncMock(return_value=0),
        ),
    ]

    with ExitStack() as stack:
        mocks = [stack.enter_context(p) for p in patchers]
        reconcile_mock = mocks[-1]

        app = FastAPI()
        async with lifespan_mod.lifespan(app):
            pass

    assert reconcile_mock.await_count == expected_calls
