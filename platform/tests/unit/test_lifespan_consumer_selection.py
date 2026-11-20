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
]


def _make_tasks(enabled_consumers: str) -> set[str]:
    settings = MagicMock(enabled_consumers=enabled_consumers, remediation_workers=1)
    with (
        patch("app.platform.lifespan.get_settings", return_value=settings),
        patch("app.platform.database.get_database", return_value=MagicMock()),
    ):
        tasks = lifespan_mod._make_consumer_tasks(conference_manager=None)
    for task in tasks:
        task.cancel()
    return {task.get_name() for task in tasks}


@pytest.mark.asyncio
async def test_empty_enabled_consumers_starts_every_consumer():
    names = _make_tasks("")

    assert {
        "ContentJobConsumer",
        "SyncJobConsumer",
        "DtmfConsumer",
        "CallEventConsumer",
        "CallWebhookConsumer",
        "TextbookRemediationConsumer-1",
    } <= names


@pytest.mark.asyncio
async def test_enabled_consumers_starts_only_listed_consumers():
    assert _make_tasks("ContentJobConsumer") == {"ContentJobConsumer"}


@pytest.mark.asyncio
async def test_enabled_consumers_accepts_spaced_list_and_all_remediation_workers():
    assert _make_tasks(" ContentJobConsumer , TextbookRemediationConsumer ") == {
        "ContentJobConsumer",
        "TextbookRemediationConsumer-1",
    }


@pytest.mark.asyncio
async def test_unknown_enabled_consumer_fails_loudly():
    with pytest.raises(RuntimeError, match="ContentJobConsumr"):
        _make_tasks("ContentJobConsumr")


async def _run_lifespan(app_mode: str, enabled_consumers: str) -> dict[str, MagicMock]:
    settings = MagicMock(app_mode=app_mode, enabled_consumers=enabled_consumers, env="development", version="0.1.0")
    ws_instance = MagicMock(initialize=AsyncMock(), close=AsyncMock())
    with ExitStack() as stack:
        stack.enter_context(patch("app.platform.lifespan.get_settings", return_value=settings))
        stack.enter_context(patch("app.platform.lifespan.init_database", new=AsyncMock()))
        stack.enter_context(patch("app.platform.lifespan.get_database", return_value=MagicMock()))
        stack.enter_context(patch("app.platform.lifespan.close_database", new=AsyncMock()))
        stack.enter_context(patch("app.platform.lifespan.close_subodha_client", new=AsyncMock()))
        mocks = {
            "conf_mgr": stack.enter_context(
                patch("app.platform.lifespan._init_conference_manager", return_value=MagicMock(close=AsyncMock()))
            ),
            "make_tasks": stack.enter_context(patch("app.platform.lifespan._make_consumer_tasks", return_value=[])),
            "ws_client": stack.enter_context(
                patch("app.providers.websocket_client.WebsocketClientProvider", return_value=ws_instance)
            ),
            "remediation_reconcile": stack.enter_context(
                patch(
                    "app.repositories.textbook_remediation_repository.TextbookRemediationRepository.reconcile_interrupted_jobs",
                    new=AsyncMock(return_value=0),
                )
            ),
            "sync_reconcile": stack.enter_context(
                patch.object(ContentAggregatorSyncJobRepository, "reconcile_interrupted_jobs", new=AsyncMock(return_value=0))
            ),
        }
        stack.enter_context(patch("app.providers.service_bus.service_bus_provider.initialize", new=AsyncMock()))
        stack.enter_context(patch("app.providers.service_bus.service_bus_provider.close", new=AsyncMock()))
        stack.enter_context(patch.object(ContentAggregatorSyncJobRepository, "ensure_indexes", new=AsyncMock()))
        for target in ENSURE_INDEXES_TARGETS:
            stack.enter_context(patch(f"{target}.ensure_indexes", new=AsyncMock()))

        async with lifespan_mod.lifespan(FastAPI()):
            pass
    return mocks


@pytest.mark.asyncio
async def test_consumer_mode_skips_conference_manager_and_confv2server_connection():
    mocks = await _run_lifespan("consumer", "ContentJobConsumer")

    mocks["conf_mgr"].assert_not_called()
    mocks["ws_client"].assert_not_called()
    mocks["make_tasks"].assert_called_once_with(None)


@pytest.mark.asyncio
async def test_consumer_mode_skips_reconcile_for_disabled_remediation_and_sync():
    mocks = await _run_lifespan("consumer", "ContentJobConsumer")

    mocks["remediation_reconcile"].assert_not_awaited()
    mocks["sync_reconcile"].assert_not_awaited()


@pytest.mark.asyncio
async def test_api_mode_keeps_conference_manager_and_confv2server_connection():
    mocks = await _run_lifespan("api", "")

    mocks["conf_mgr"].assert_called_once()
    mocks["ws_client"].assert_called_once()
    mocks["make_tasks"].assert_not_called()


@pytest.mark.asyncio
async def test_all_mode_with_default_config_is_unchanged():
    mocks = await _run_lifespan("all", "")

    mocks["conf_mgr"].assert_called_once()
    mocks["ws_client"].assert_called_once()
    mocks["make_tasks"].assert_called_once()
    mocks["remediation_reconcile"].assert_awaited_once()
    mocks["sync_reconcile"].assert_awaited_once()
