"""Coverage for app.platform.lifespan."""

from __future__ import annotations

import asyncio
import importlib
import logging
from collections.abc import Callable
from unittest.mock import AsyncMock, MagicMock, create_autospec, patch

import pytest
from fastapi import FastAPI

import app.platform.lifespan as lifespan_module
from app.platform.settings import Settings


@pytest.fixture(autouse=True)
def _reset_conference_manager(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(lifespan_module, "_conference_manager", None)


_BASE_SETTINGS = Settings(
    vonage_conference_application_private_key64="",
    vonage_conference_application_id="app-id",
    vonage_number="+100",
    events_webhook_ep="https://hooks.example.com",
    vonage_call_timeout_seconds=30.0,
    websocket_service_url="wss://ws.example.com",
    app_mode="api",
    env="development",
    version="1.0",
)


def _fake_settings(**overrides):
    return _BASE_SETTINGS.model_copy(update=overrides) if overrides else _BASE_SETTINGS


def _capture_manager_kwargs(mock_manager_cls):
    captured = {}

    def _capture(**kw):
        captured.update(kw)
        return MagicMock()

    mock_manager_cls.side_effect = _capture
    return captured


class TestGetConferenceManager:
    def test_raises_when_not_initialized(self) -> None:
        with pytest.raises(RuntimeError, match="not initialized"):
            lifespan_module.get_conference_manager()


class TestInitConferenceManager:
    def test_builds_manager_with_empty_private_key(self) -> None:
        settings = _fake_settings()
        with (
            patch("app.platform.lifespan.get_settings", return_value=settings),
            patch("app.providers.vonage_api.VonageAPIProvider"),
            patch("app.providers.smartphone_connection.SmartphoneConnectionManagerFactory") as mock_factory,
            patch("app.services.conference_service.ConferenceCallManager") as mock_manager_cls,
        ):
            mock_manager_cls.return_value = MagicMock()
            result = lifespan_module._init_conference_manager()

            mock_manager_cls.assert_called_once()
            kwargs = mock_manager_cls.call_args.kwargs
            assert kwargs["connection_manager_factory"] is mock_factory.return_value
            assert kwargs["ws_base_url"] == "wss://ws.example.com"
            assert result is mock_manager_cls.return_value
            assert lifespan_module._conference_manager is result

    def test_decodes_base64_private_key(self) -> None:
        import base64

        settings = _fake_settings(vonage_conference_application_private_key64=base64.b64encode(b"decoded-key-material-placeholder").decode())
        with (
            patch("app.platform.lifespan.get_settings", return_value=settings),
            patch("app.providers.vonage_api.VonageAPIProvider") as mock_provider,
            patch("app.providers.smartphone_connection.SmartphoneConnectionManagerFactory"),
            patch("app.services.conference_service.ConferenceCallManager") as mock_manager_cls,
        ):
            captured = _capture_manager_kwargs(mock_manager_cls)

            lifespan_module._init_conference_manager()
            captured["communication_api_factory"].create("conf1", "ws://x")

            mock_provider.assert_called_once()
            assert mock_provider.call_args.kwargs["private_key"] == "decoded-key-material-placeholder"

    def test_invalid_base64_raises(self) -> None:
        import binascii

        settings = _fake_settings(vonage_conference_application_private_key64="not-valid-base64!!!")
        with (
            patch("app.platform.lifespan.get_settings", return_value=settings),
            pytest.raises(binascii.Error),
        ):
            lifespan_module._init_conference_manager()

    def test_vonage_api_factory_creates_provider_with_expected_args(self) -> None:
        settings = _fake_settings()
        with (
            patch("app.platform.lifespan.get_settings", return_value=settings),
            patch("app.providers.vonage_api.VonageAPIProvider") as mock_provider,
            patch("app.providers.smartphone_connection.SmartphoneConnectionManagerFactory"),
            patch("app.services.conference_service.ConferenceCallManager") as mock_manager_cls,
        ):
            captured = _capture_manager_kwargs(mock_manager_cls)
            lifespan_module._init_conference_manager()

            captured["communication_api_factory"].create("conf-99", "wss://leg")

            mock_provider.assert_called_once_with(
                application_id="app-id",
                private_key="",
                vonage_number="+100",
                conf_id="conf-99",
                ws_server_url="wss://leg",
                events_webhook_url="https://hooks.example.com",
                call_timeout_seconds=30.0,
            )


CONSUMER_SPECS: list[tuple[str, str]] = [
    ("audio_recording_consumer", "AudioRecordingConsumer"),
    ("audio_analysis_consumer", "AudioAnalysisConsumer"),
    ("call_event_consumer", "CallEventConsumer"),
    ("dtmf_consumer", "DtmfConsumer"),
    ("call_webhook_consumer", "CallWebhookConsumer"),
    ("content_job_consumer", "ContentJobConsumer"),
    ("textbook_remediation_consumer", "TextbookRemediationConsumer"),
    ("sync_job_consumer", "SyncJobConsumer"),
]


def _patch_consumer(monkeypatch: pytest.MonkeyPatch, module_path: str, class_name: str) -> MagicMock:
    cls = getattr(importlib.import_module(f"app.consumers.{module_path}"), class_name)
    mock_cls = create_autospec(cls)
    monkeypatch.setattr(f"app.consumers.{module_path}.{class_name}", mock_cls)
    return mock_cls


class TestMakeConsumerTasks:
    def _patch_all_consumers(self, monkeypatch: pytest.MonkeyPatch) -> dict[str, MagicMock]:
        mocks = {}
        for module_path, class_name in CONSUMER_SPECS:
            mocks[class_name] = _patch_consumer(monkeypatch, module_path, class_name)
        return mocks

    async def _cleanup(self, tasks):
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def test_creates_task_for_every_consumer(self, monkeypatch: pytest.MonkeyPatch) -> None:
        mocks = self._patch_all_consumers(monkeypatch)
        sentinel_db = MagicMock()
        sentinel_mgr = MagicMock()
        monkeypatch.setattr("app.platform.database.get_database", lambda: sentinel_db)

        tasks = lifespan_module._make_consumer_tasks(conference_manager=sentinel_mgr)
        try:
            assert len(tasks) == 8
            names = {t.get_name() for t in tasks}
            assert names == {class_name for _, class_name in CONSUMER_SPECS}
            mocks["AudioAnalysisConsumer"].assert_called_once_with(conference_manager=sentinel_mgr)
            mocks["ContentJobConsumer"].assert_called_once_with(sentinel_db)
            mocks["TextbookRemediationConsumer"].assert_called_once_with(sentinel_db)
            mocks["SyncJobConsumer"].assert_called_once_with(sentinel_db)
        finally:
            await self._cleanup(tasks)

    async def test_consumer_constructor_failure_is_isolated(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
        self._patch_all_consumers(monkeypatch)
        monkeypatch.setattr(
            "app.consumers.dtmf_consumer.DtmfConsumer",
            MagicMock(side_effect=RuntimeError("boom")),
        )
        monkeypatch.setattr("app.platform.database.get_database", lambda: MagicMock())

        with caplog.at_level(logging.ERROR, logger="app.platform.lifespan"):
            tasks = lifespan_module._make_consumer_tasks(conference_manager=MagicMock())
        try:
            assert len(tasks) == 7
            names = {t.get_name() for t in tasks}
            assert "DtmfConsumer" not in names
            assert "Failed to initialise DtmfConsumer: boom" in caplog.text
        finally:
            await self._cleanup(tasks)

    async def test_task_creation_failure_is_isolated(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
        self._patch_all_consumers(monkeypatch)
        monkeypatch.setattr("app.platform.database.get_database", lambda: MagicMock())

        real_create_task = asyncio.create_task

        def flaky_create_task(coro, *, name=None):
            if name == "CallWebhookConsumer":
                coro.close()
                raise RuntimeError("scheduling failed")
            return real_create_task(coro, name=name)

        monkeypatch.setattr(asyncio, "create_task", flaky_create_task)

        with caplog.at_level(logging.ERROR, logger="app.platform.lifespan"):
            tasks = lifespan_module._make_consumer_tasks(conference_manager=MagicMock())
        try:
            assert len(tasks) == 7
            names = {t.get_name() for t in tasks}
            assert "CallWebhookConsumer" not in names
            assert "Failed to create task for CallWebhookConsumer: scheduling failed" in caplog.text
        finally:
            await self._cleanup(tasks)

    async def test_all_consumer_constructor_failures_return_empty_list(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
        for module_path, class_name in CONSUMER_SPECS:
            monkeypatch.setattr(
                f"app.consumers.{module_path}.{class_name}",
                MagicMock(side_effect=RuntimeError("boom")),
            )
        monkeypatch.setattr("app.platform.database.get_database", lambda: MagicMock())

        with caplog.at_level(logging.ERROR, logger="app.platform.lifespan"):
            tasks = lifespan_module._make_consumer_tasks(conference_manager=MagicMock())
        assert tasks == []
        for _, class_name in CONSUMER_SPECS:
            assert f"Failed to initialise {class_name}: boom" in caplog.text


def _patch_repo(
    monkeypatch: pytest.MonkeyPatch, path: str, attr: str, reconcile: int | None = None
) -> MagicMock:
    cls = getattr(importlib.import_module(path), attr)
    mock_cls = create_autospec(cls)
    if reconcile is not None:
        mock_cls.return_value.reconcile_interrupted_jobs.return_value = reconcile
    monkeypatch.setattr(f"{path}.{attr}", mock_cls)
    return mock_cls


def _reconcile_content_aggregator(tc: TestLifespan) -> None:
    tc._repo_mocks["ContentAggregatorSyncJobRepository"].return_value.reconcile_interrupted_jobs.return_value = 3


def _reconcile_textbook_remediation(tc: TestLifespan) -> None:
    tc._repo_mocks["TextbookRemediationRepository"].return_value.reconcile_interrupted_jobs.return_value = 2


def _reconcile_sync_job_service(tc: TestLifespan) -> None:
    lifespan_module.get_sync_job_service.return_value.reconcile_interrupted_jobs = AsyncMock(return_value=5)


def _fail_conference_manager_close(tc: TestLifespan, monkeypatch: pytest.MonkeyPatch) -> None:
    conf_mgr = MagicMock(close=AsyncMock(side_effect=RuntimeError("close failed")))
    tc._patch_common(monkeypatch, app_mode="api", init_conf_mgr=conf_mgr)


def _fail_subodha_client_close(tc: TestLifespan, monkeypatch: pytest.MonkeyPatch) -> None:
    tc._patch_common(monkeypatch, app_mode="api")
    lifespan_module.close_subodha_client.side_effect = RuntimeError("close failed")


def _fail_websocket_client_close(tc: TestLifespan, monkeypatch: pytest.MonkeyPatch) -> None:
    tc._patch_common(monkeypatch, app_mode="api", init_conf_mgr=MagicMock(close=AsyncMock()))
    fake_ws_client = MagicMock(initialize=AsyncMock(), close=AsyncMock(side_effect=RuntimeError("close failed")))
    monkeypatch.setattr("app.providers.websocket_client.WebsocketClientProvider", MagicMock(return_value=fake_ws_client))


class TestLifespan:
    @pytest.fixture
    def fake_app(self) -> FastAPI:
        return FastAPI()

    def _patch_common(self, monkeypatch, app_mode="api", init_conf_mgr=None, make_tasks=None):
        monkeypatch.setattr(lifespan_module, "get_settings", lambda: _fake_settings(app_mode=app_mode))
        monkeypatch.setattr(lifespan_module, "init_database", AsyncMock())
        monkeypatch.setattr(lifespan_module, "close_database", AsyncMock())
        monkeypatch.setattr(lifespan_module, "get_database", lambda: MagicMock())
        monkeypatch.setattr(lifespan_module, "close_subodha_client", AsyncMock())

        self._repo_mocks = {
            "ContentAggregatorSyncJobRepository": _patch_repo(monkeypatch, "app.repositories.content_aggregator_sync_job_repository", "ContentAggregatorSyncJobRepository", reconcile=0),
            "ContentJobRepository": _patch_repo(monkeypatch, "app.repositories.content_job_repository", "ContentJobRepository"),
            "TextbookRemediationRepository": _patch_repo(monkeypatch, "app.repositories.textbook_remediation_repository", "TextbookRemediationRepository", reconcile=0),
            "WebsiteRepository": _patch_repo(monkeypatch, "app.repositories.website_repository", "WebsiteRepository"),
            "TranslationRepository": _patch_repo(monkeypatch, "app.repositories.translation_repository", "TranslationRepository"),
            "TranslationVersionRepository": _patch_repo(monkeypatch, "app.repositories.translation_version_repository", "TranslationVersionRepository"),
            "TranslationAuditRepository": _patch_repo(monkeypatch, "app.repositories.translation_audit_repository", "TranslationAuditRepository"),
        }

        monkeypatch.setattr(lifespan_module, "_init_conference_manager", MagicMock(return_value=init_conf_mgr))
        monkeypatch.setattr(lifespan_module, "_make_consumer_tasks", MagicMock(return_value=make_tasks))
        monkeypatch.setattr(
            lifespan_module,
            "get_sync_job_service",
            MagicMock(return_value=MagicMock(reconcile_interrupted_jobs=AsyncMock(return_value=0))),
        )
        monkeypatch.setattr(
            "app.providers.websocket_client.WebsocketClientProvider",
            MagicMock(return_value=MagicMock(initialize=AsyncMock(), close=AsyncMock())),
        )

    async def test_api_mode_startup_and_shutdown(self, monkeypatch: pytest.MonkeyPatch, fake_app: FastAPI) -> None:
        conf_mgr = MagicMock(close=AsyncMock())
        self._patch_common(monkeypatch, app_mode="api", init_conf_mgr=conf_mgr)

        async with lifespan_module.lifespan(fake_app):
            assert fake_app.state.consumer_tasks == []
            assert fake_app.state.conference_manager is conf_mgr

        lifespan_module.close_database.assert_awaited_once()
        lifespan_module.close_subodha_client.assert_awaited_once()
        lifespan_module.get_sync_job_service.return_value.reconcile_interrupted_jobs.assert_not_awaited()
        for repo_mock in self._repo_mocks.values():
            repo_mock.ensure_indexes.assert_awaited_once()
        self._repo_mocks["TextbookRemediationRepository"].return_value.reconcile_interrupted_jobs.assert_not_awaited()
        lifespan_module._make_consumer_tasks.assert_not_called()

    async def test_consumer_mode_starts_tasks_and_reconciles(self, monkeypatch: pytest.MonkeyPatch, fake_app: FastAPI) -> None:
        task = asyncio.get_running_loop().create_task(asyncio.sleep(10))
        self._patch_common(monkeypatch, app_mode="consumer", make_tasks=[task])

        async with lifespan_module.lifespan(fake_app):
            assert fake_app.state.consumer_tasks == [task]
            lifespan_module.get_sync_job_service.return_value.reconcile_interrupted_jobs.assert_awaited_once()

        assert task.cancelled() is True
        assert task.done() is True
        lifespan_module._make_consumer_tasks.assert_called_once_with(fake_app.state.conference_manager)

    async def test_consumer_mode_zero_tasks_logs_degraded_warning(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, fake_app: FastAPI
    ) -> None:
        self._patch_common(monkeypatch, app_mode="consumer", make_tasks=[])

        with caplog.at_level(logging.WARNING, logger="app.platform.lifespan"):
            async with lifespan_module.lifespan(fake_app):
                assert fake_app.state.consumer_tasks == []

        assert "No consumers started" in caplog.text

    async def test_consumer_task_creation_failure_reraises(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, fake_app: FastAPI
    ) -> None:
        self._patch_common(monkeypatch, app_mode="all")
        lifespan_module._make_consumer_tasks.side_effect = RuntimeError("consumer startup failed")

        with (
            caplog.at_level(logging.ERROR, logger="app.platform.lifespan"),
            pytest.raises(RuntimeError, match="consumer startup failed"),
        ):
            async with lifespan_module.lifespan(fake_app):
                pass

        assert "Failed to start consumers: consumer startup failed" in caplog.text

    async def test_ensure_indexes_failure_propagates_before_yield(self, monkeypatch: pytest.MonkeyPatch, fake_app: FastAPI) -> None:
        self._patch_common(monkeypatch, app_mode="api")
        self._repo_mocks["WebsiteRepository"].ensure_indexes.side_effect = RuntimeError("idx")

        with pytest.raises(RuntimeError, match="idx"):
            async with lifespan_module.lifespan(fake_app):
                pytest.fail("lifespan should not reach yield when ensure_indexes fails")

    async def test_conference_manager_init_failure_is_non_fatal(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, fake_app: FastAPI
    ) -> None:
        self._patch_common(monkeypatch, app_mode="api")
        lifespan_module._init_conference_manager.side_effect = RuntimeError("vonage down")

        with caplog.at_level(logging.WARNING, logger="app.platform.lifespan"):
            async with lifespan_module.lifespan(fake_app):
                assert fake_app.state.conference_manager is None

        assert "Conference manager init failed (non-fatal in test mode): vonage down" in caplog.text

    async def test_websocket_client_initialized_when_conference_manager_present(
        self, monkeypatch: pytest.MonkeyPatch, fake_app: FastAPI
    ) -> None:
        self._patch_common(monkeypatch, app_mode="api", init_conf_mgr=MagicMock(close=AsyncMock()))
        fake_ws_client = MagicMock(initialize=AsyncMock(), close=AsyncMock())
        mock_ws_provider_cls = MagicMock(return_value=fake_ws_client)
        monkeypatch.setattr("app.providers.websocket_client.WebsocketClientProvider", mock_ws_provider_cls)

        async with lifespan_module.lifespan(fake_app):
            fake_ws_client.initialize.assert_awaited_once_with(fake_app.state.conference_manager)

        fake_ws_client.close.assert_awaited_once()

    async def test_websocket_client_init_failure_is_non_fatal(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, fake_app: FastAPI
    ) -> None:
        self._patch_common(monkeypatch, app_mode="api", init_conf_mgr=MagicMock(close=AsyncMock()))
        mock_ws_provider_cls = MagicMock(side_effect=RuntimeError("ws down"))
        monkeypatch.setattr("app.providers.websocket_client.WebsocketClientProvider", mock_ws_provider_cls)

        with caplog.at_level(logging.WARNING, logger="app.platform.lifespan"):
            async with lifespan_module.lifespan(fake_app):
                pass  # should not raise

        assert "WebsocketClientProvider init failed (non-fatal): ws down" in caplog.text
        lifespan_module.close_database.assert_awaited_once()
        lifespan_module.close_subodha_client.assert_awaited_once()

    async def test_websocket_client_skipped_when_no_conference_manager(
        self, monkeypatch: pytest.MonkeyPatch, fake_app: FastAPI
    ) -> None:
        self._patch_common(monkeypatch, app_mode="api", init_conf_mgr=None)
        mock_ws_provider_cls = MagicMock()
        monkeypatch.setattr("app.providers.websocket_client.WebsocketClientProvider", mock_ws_provider_cls)

        async with lifespan_module.lifespan(fake_app):
            pass

        mock_ws_provider_cls.assert_not_called()

    @pytest.mark.parametrize(
        ("app_mode", "configure", "expected_log"),
        [
            ("api", _reconcile_content_aggregator, "Reconciled 3 interrupted content aggregator sync jobs"),
            ("consumer", _reconcile_textbook_remediation, "Reconciled 2 interrupted textbook remediation jobs"),
            ("all", _reconcile_sync_job_service, "Reconciled 5 interrupted content aggregator sync jobs"),
        ],
    )
    async def test_logs_reconciled_jobs(
        self,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
        fake_app: FastAPI,
        app_mode: str,
        configure: Callable[[TestLifespan], None],
        expected_log: str,
    ) -> None:
        self._patch_common(monkeypatch, app_mode=app_mode)
        configure(self)

        with caplog.at_level(logging.INFO, logger="app.platform.lifespan"):
            async with lifespan_module.lifespan(fake_app):
                pass

        assert expected_log in caplog.text

    @pytest.mark.parametrize(
        ("configure", "expected_log"),
        [
            (_fail_conference_manager_close, "Conference manager close failed: close failed"),
            (_fail_subodha_client_close, "Subodha client close failed: close failed"),
            (_fail_websocket_client_close, "WebsocketClientProvider close failed: close failed"),
        ],
    )
    async def test_close_failure_is_swallowed(
        self,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
        fake_app: FastAPI,
        configure: Callable[[TestLifespan, pytest.MonkeyPatch], None],
        expected_log: str,
    ) -> None:
        configure(self, monkeypatch)

        with caplog.at_level(logging.WARNING, logger="app.platform.lifespan"):
            async with lifespan_module.lifespan(fake_app):
                pass  # should not raise on shutdown

        assert expected_log in caplog.text
