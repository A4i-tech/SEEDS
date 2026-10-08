"""Coverage for app.platform.lifespan."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import app.platform.lifespan as lifespan_module


@pytest.fixture(autouse=True)
def _reset_conference_manager():
    lifespan_module._conference_manager = None
    yield
    lifespan_module._conference_manager = None


def _fake_settings(**overrides):
    base = {
        "vonage_conference_application_private_key64": "",
        "vonage_conference_application_id": "app-id",
        "vonage_number": "+100",
        "events_webhook_ep": "https://hooks.example.com",
        "vonage_call_timeout_seconds": 30.0,
        "websocket_service_url": "wss://ws.example.com",
        "app_mode": "api",
        "env": "test",
        "version": "1.0",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class TestGetConferenceManager:
    def test_raises_when_not_initialized(self) -> None:
        with pytest.raises(RuntimeError, match="not initialized"):
            lifespan_module.get_conference_manager()

    def test_returns_singleton_once_set(self) -> None:
        sentinel = object()
        lifespan_module._conference_manager = sentinel
        assert lifespan_module.get_conference_manager() is sentinel


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
            mock_manager_cls.return_value = MagicMock()
            mock_manager_cls.side_effect = lambda **kw: kw["communication_api_factory"].create("conf1", "ws://x") and MagicMock()

            lifespan_module._init_conference_manager()

            mock_provider.assert_called_once()
            assert mock_provider.call_args.kwargs["private_key"] == "decoded-key-material-placeholder"

    def test_invalid_base64_falls_back_to_raw_value(self) -> None:
        settings = _fake_settings(vonage_conference_application_private_key64="not-valid-base64!!!")
        with (
            patch("app.platform.lifespan.get_settings", return_value=settings),
            patch("app.providers.vonage_api.VonageAPIProvider") as mock_provider,
            patch("app.providers.smartphone_connection.SmartphoneConnectionManagerFactory"),
            patch("app.services.conference_service.ConferenceCallManager") as mock_manager_cls,
        ):
            mock_manager_cls.side_effect = lambda **kw: kw["communication_api_factory"].create("conf1", "ws://x") and MagicMock()

            lifespan_module._init_conference_manager()

            assert mock_provider.call_args.kwargs["private_key"] == "not-valid-base64!!!"

    async def test_noop_storage_manager_save_state_is_a_noop(self) -> None:
        settings = _fake_settings()
        with (
            patch("app.platform.lifespan.get_settings", return_value=settings),
            patch("app.providers.vonage_api.VonageAPIProvider"),
            patch("app.providers.smartphone_connection.SmartphoneConnectionManagerFactory"),
            patch("app.services.conference_service.ConferenceCallManager") as mock_manager_cls,
        ):
            captured = {}

            def _capture(**kw):
                captured.update(kw)
                return MagicMock()

            mock_manager_cls.side_effect = _capture
            lifespan_module._init_conference_manager()

            result = await captured["storage_manager"].save_state("conf1", {"a": 1})
            assert result is None

    def test_vonage_api_factory_creates_provider_with_expected_args(self) -> None:
        settings = _fake_settings()
        with (
            patch("app.platform.lifespan.get_settings", return_value=settings),
            patch("app.providers.vonage_api.VonageAPIProvider") as mock_provider,
            patch("app.providers.smartphone_connection.SmartphoneConnectionManagerFactory"),
            patch("app.services.conference_service.ConferenceCallManager") as mock_manager_cls,
        ):
            captured = {}

            def _capture(**kw):
                captured.update(kw)
                return MagicMock()

            mock_manager_cls.side_effect = _capture
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


def _patch_consumer(monkeypatch, module_path, class_name, instance=None):
    mock_cls = MagicMock(return_value=instance or MagicMock(run=AsyncMock()))
    monkeypatch.setattr(f"app.consumers.{module_path}.{class_name}", mock_cls)
    return mock_cls


class TestMakeConsumerTasks:
    def _patch_all_consumers(self, monkeypatch):
        specs = [
            ("audio_recording_consumer", "AudioRecordingConsumer"),
            ("audio_analysis_consumer", "AudioAnalysisConsumer"),
            ("call_event_consumer", "CallEventConsumer"),
            ("dtmf_consumer", "DtmfConsumer"),
            ("call_webhook_consumer", "CallWebhookConsumer"),
            ("content_job_consumer", "ContentJobConsumer"),
            ("textbook_remediation_consumer", "TextbookRemediationConsumer"),
            ("sync_job_consumer", "SyncJobConsumer"),
        ]
        mocks = {}
        for module_path, class_name in specs:
            mocks[class_name] = _patch_consumer(monkeypatch, module_path, class_name)
        return mocks

    async def _cleanup(self, tasks):
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def test_creates_task_for_every_consumer(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_all_consumers(monkeypatch)
        monkeypatch.setattr("app.platform.database.get_database", lambda: MagicMock())

        tasks = lifespan_module._make_consumer_tasks(conference_manager=MagicMock())
        try:
            assert len(tasks) == 8
            names = {t.get_name() for t in tasks}
            assert names == {
                "AudioRecordingConsumer",
                "AudioAnalysisConsumer",
                "CallEventConsumer",
                "DtmfConsumer",
                "CallWebhookConsumer",
                "ContentJobConsumer",
                "TextbookRemediationConsumer",
                "SyncJobConsumer",
            }
        finally:
            await self._cleanup(tasks)

    async def test_consumer_constructor_failure_is_isolated(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_all_consumers(monkeypatch)
        monkeypatch.setattr(
            "app.consumers.dtmf_consumer.DtmfConsumer",
            MagicMock(side_effect=RuntimeError("boom")),
        )
        monkeypatch.setattr("app.platform.database.get_database", lambda: MagicMock())

        tasks = lifespan_module._make_consumer_tasks(conference_manager=MagicMock())
        try:
            assert len(tasks) == 7
            names = {t.get_name() for t in tasks}
            assert "DtmfConsumer" not in names
        finally:
            await self._cleanup(tasks)

    async def test_task_creation_failure_is_isolated(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_all_consumers(monkeypatch)
        monkeypatch.setattr("app.platform.database.get_database", lambda: MagicMock())

        real_create_task = asyncio.create_task

        def flaky_create_task(coro, *, name=None):
            if name == "CallWebhookConsumer":
                coro.close()
                raise RuntimeError("scheduling failed")
            return real_create_task(coro, name=name)

        monkeypatch.setattr(asyncio, "create_task", flaky_create_task)

        tasks = lifespan_module._make_consumer_tasks(conference_manager=MagicMock())
        try:
            assert len(tasks) == 7
            names = {t.get_name() for t in tasks}
            assert "CallWebhookConsumer" not in names
        finally:
            await self._cleanup(tasks)

    async def test_passes_conference_manager_to_audio_analysis_consumer(self, monkeypatch: pytest.MonkeyPatch) -> None:
        mocks = self._patch_all_consumers(monkeypatch)
        monkeypatch.setattr("app.platform.database.get_database", lambda: MagicMock())
        sentinel_mgr = MagicMock()

        tasks = lifespan_module._make_consumer_tasks(conference_manager=sentinel_mgr)
        try:
            mocks["AudioAnalysisConsumer"].assert_called_once_with(conference_manager=sentinel_mgr)
        finally:
            await self._cleanup(tasks)

    async def test_all_consumer_constructor_failures_are_isolated(self, monkeypatch: pytest.MonkeyPatch) -> None:
        specs = [
            ("audio_recording_consumer", "AudioRecordingConsumer"),
            ("audio_analysis_consumer", "AudioAnalysisConsumer"),
            ("call_event_consumer", "CallEventConsumer"),
            ("dtmf_consumer", "DtmfConsumer"),
            ("call_webhook_consumer", "CallWebhookConsumer"),
            ("content_job_consumer", "ContentJobConsumer"),
            ("textbook_remediation_consumer", "TextbookRemediationConsumer"),
            ("sync_job_consumer", "SyncJobConsumer"),
        ]
        for module_path, class_name in specs:
            monkeypatch.setattr(
                f"app.consumers.{module_path}.{class_name}",
                MagicMock(side_effect=RuntimeError("boom")),
            )
        monkeypatch.setattr("app.platform.database.get_database", lambda: MagicMock())

        tasks = lifespan_module._make_consumer_tasks(conference_manager=MagicMock())
        assert tasks == []

    async def test_passes_db_to_db_backed_consumers(self, monkeypatch: pytest.MonkeyPatch) -> None:
        mocks = self._patch_all_consumers(monkeypatch)
        sentinel_db = MagicMock()
        monkeypatch.setattr("app.platform.database.get_database", lambda: sentinel_db)

        tasks = lifespan_module._make_consumer_tasks(conference_manager=MagicMock())
        try:
            mocks["ContentJobConsumer"].assert_called_once_with(sentinel_db)
            mocks["TextbookRemediationConsumer"].assert_called_once_with(sentinel_db)
            mocks["SyncJobConsumer"].assert_called_once_with(sentinel_db)
        finally:
            await self._cleanup(tasks)


def _patch_repo(monkeypatch, path, attr, ensure_indexes=None, reconcile=None):
    mock_cls = MagicMock()
    if ensure_indexes is not None:
        mock_cls.ensure_indexes = AsyncMock(return_value=None)
    if reconcile is not None:
        mock_cls.return_value.reconcile_interrupted_jobs = AsyncMock(return_value=reconcile)
    monkeypatch.setattr(f"{path}.{attr}", mock_cls)
    return mock_cls


class TestLifespan:
    def _patch_common(self, monkeypatch, app_mode="api", init_conf_mgr=None, make_tasks=None):
        monkeypatch.setattr(lifespan_module, "get_settings", lambda: _fake_settings(app_mode=app_mode))
        monkeypatch.setattr(lifespan_module, "init_database", AsyncMock())
        monkeypatch.setattr(lifespan_module, "close_database", AsyncMock())
        monkeypatch.setattr(lifespan_module, "get_database", lambda: MagicMock())
        monkeypatch.setattr(lifespan_module, "close_subodha_client", AsyncMock())

        _patch_repo(monkeypatch, "app.repositories.content_aggregator_sync_job_repository", "ContentAggregatorSyncJobRepository", reconcile=0)
        _patch_repo(monkeypatch, "app.repositories.textbook_remediation_repository", "TextbookRemediationRepository", reconcile=0)
        _patch_repo(monkeypatch, "app.repositories.website_repository", "WebsiteRepository", ensure_indexes=True)
        _patch_repo(monkeypatch, "app.repositories.translation_repository", "TranslationRepository", ensure_indexes=True)
        _patch_repo(monkeypatch, "app.repositories.translation_version_repository", "TranslationVersionRepository", ensure_indexes=True)
        _patch_repo(monkeypatch, "app.repositories.translation_audit_repository", "TranslationAuditRepository", ensure_indexes=True)

        monkeypatch.setattr(
            lifespan_module,
            "_init_conference_manager",
            MagicMock(return_value=init_conf_mgr if init_conf_mgr is not None else MagicMock(close=AsyncMock())),
        )
        monkeypatch.setattr(lifespan_module, "_make_consumer_tasks", MagicMock(return_value=make_tasks or []))
        monkeypatch.setattr(
            lifespan_module,
            "get_sync_job_service",
            MagicMock(return_value=MagicMock(reconcile_interrupted_jobs=AsyncMock(return_value=0))),
        )
        monkeypatch.setattr(
            "app.providers.websocket_client.WebsocketClientProvider",
            MagicMock(return_value=MagicMock(initialize=AsyncMock(), close=AsyncMock())),
        )

    async def test_api_mode_startup_and_shutdown(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="api")
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            assert fake_app.state.consumer_tasks == []
            assert fake_app.state.conference_manager is not None

        lifespan_module.close_database.assert_awaited_once()
        lifespan_module.close_subodha_client.assert_awaited_once()

    async def test_consumer_mode_starts_tasks_and_reconciles(self, monkeypatch: pytest.MonkeyPatch) -> None:
        task = asyncio.get_event_loop().create_task(asyncio.sleep(10))
        self._patch_common(monkeypatch, app_mode="consumer", make_tasks=[task])
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            assert fake_app.state.consumer_tasks == [task]
            lifespan_module.get_sync_job_service.return_value.reconcile_interrupted_jobs.assert_awaited_once()

        assert task.cancelled() or task.done()

    async def test_consumer_task_creation_failure_reraises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="all")
        lifespan_module._make_consumer_tasks.side_effect = RuntimeError("consumer startup failed")
        fake_app = SimpleNamespace(state=SimpleNamespace())

        with pytest.raises(RuntimeError, match="consumer startup failed"):
            async with lifespan_module.lifespan(fake_app):
                pass

    async def test_conference_manager_init_failure_is_non_fatal(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="api")
        lifespan_module._init_conference_manager.side_effect = RuntimeError("vonage down")
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            assert fake_app.state.conference_manager is None

    async def test_websocket_client_initialized_when_conference_manager_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="api")
        fake_ws_client = MagicMock(initialize=AsyncMock(), close=AsyncMock())
        mock_ws_provider_cls = MagicMock(return_value=fake_ws_client)
        monkeypatch.setattr("app.providers.websocket_client.WebsocketClientProvider", mock_ws_provider_cls)
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            fake_ws_client.initialize.assert_awaited_once()

        fake_ws_client.close.assert_awaited_once()

    async def test_websocket_client_init_failure_is_non_fatal(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="api")
        mock_ws_provider_cls = MagicMock(side_effect=RuntimeError("ws down"))
        monkeypatch.setattr("app.providers.websocket_client.WebsocketClientProvider", mock_ws_provider_cls)
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            pass  # should not raise

    async def test_websocket_client_skipped_when_no_conference_manager(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="api", init_conf_mgr=None)
        lifespan_module._init_conference_manager.return_value = None
        mock_ws_provider_cls = MagicMock()
        monkeypatch.setattr("app.providers.websocket_client.WebsocketClientProvider", mock_ws_provider_cls)
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            pass

        mock_ws_provider_cls.assert_not_called()

    async def test_conference_manager_close_failure_is_swallowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        conf_mgr = MagicMock(close=AsyncMock(side_effect=RuntimeError("close failed")))
        self._patch_common(monkeypatch, app_mode="api", init_conf_mgr=conf_mgr)
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            pass  # should not raise on shutdown

        conf_mgr.close.assert_awaited_once()

    async def test_subodha_client_close_failure_is_swallowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="api")
        lifespan_module.close_subodha_client.side_effect = RuntimeError("close failed")
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            pass  # should not raise

    async def test_logs_reconciled_content_aggregator_jobs(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="api")
        _patch_repo(monkeypatch, "app.repositories.content_aggregator_sync_job_repository", "ContentAggregatorSyncJobRepository", reconcile=3)
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            pass  # should not raise; exercises reconciled > 0 log branch

    async def test_logs_reconciled_textbook_remediation_jobs(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="consumer")
        _patch_repo(monkeypatch, "app.repositories.textbook_remediation_repository", "TextbookRemediationRepository", reconcile=2)
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            pass  # exercises reconciled > 0 log branch for textbook remediation

    async def test_logs_reconciled_sync_job_service_jobs(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="all")
        lifespan_module.get_sync_job_service.return_value.reconcile_interrupted_jobs = AsyncMock(return_value=5)
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            pass  # exercises reconciled > 0 log branch for sync job service

    async def test_websocket_client_close_failure_is_swallowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_common(monkeypatch, app_mode="api")
        fake_ws_client = MagicMock(initialize=AsyncMock(), close=AsyncMock(side_effect=RuntimeError("close failed")))
        monkeypatch.setattr("app.providers.websocket_client.WebsocketClientProvider", MagicMock(return_value=fake_ws_client))
        fake_app = SimpleNamespace(state=SimpleNamespace())

        async with lifespan_module.lifespan(fake_app):
            pass  # should not raise on shutdown

        fake_ws_client.close.assert_awaited_once()
