"""Tests for app.platform.auth.providers.firebase_provider."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def reset_firebase_module_state():
    import app.platform.auth.providers.firebase_provider as mod

    mod._firebase_app = None
    mod._initialized = False
    yield
    mod._firebase_app = None
    mod._initialized = False


def set_auth_type(monkeypatch: pytest.MonkeyPatch, auth_type: str) -> None:
    monkeypatch.setenv("AUTH_TYPE", auth_type)
    from app.platform.settings import get_settings

    get_settings.cache_clear()


class TestEnsureInitialized:
    def test_already_initialized_returns_immediately(self) -> None:
        import app.platform.auth.providers.firebase_provider as mod

        mod._initialized = True
        mod._ensure_initialized()  # should not raise even with no firebase config

    def test_raises_when_auth_type_not_firebase(self, monkeypatch: pytest.MonkeyPatch) -> None:
        set_auth_type(monkeypatch, "jwt")
        from app.platform.auth.providers.firebase_provider import _ensure_initialized

        with pytest.raises(RuntimeError, match="AUTH_TYPE is not 'firebase'"):
            _ensure_initialized()

    def test_raises_when_service_account_not_configured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        set_auth_type(monkeypatch, "firebase")
        monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT", "")
        from app.platform.auth.providers.firebase_provider import _ensure_initialized

        with pytest.raises(RuntimeError, match="FIREBASE_SERVICE_ACCOUNT is not configured"):
            _ensure_initialized()

    def test_initializes_new_app_from_json_string(self, monkeypatch: pytest.MonkeyPatch) -> None:
        set_auth_type(monkeypatch, "firebase")
        monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT", json.dumps({"type": "service_account"}))

        fake_firebase_admin = MagicMock()
        fake_firebase_admin.app._apps = {}
        fake_firebase_admin.initialize_app.return_value = "fake-app"
        fake_credentials = MagicMock()
        fake_credentials.Certificate.return_value = "fake-cred"
        fake_firebase_admin.credentials = fake_credentials

        with patch.dict("sys.modules", {
            "firebase_admin": fake_firebase_admin,
            "firebase_admin.credentials": fake_credentials,
        }):
            import app.platform.auth.providers.firebase_provider as mod
            from app.platform.auth.providers.firebase_provider import _ensure_initialized

            _ensure_initialized()

        fake_credentials.Certificate.assert_called_once_with({"type": "service_account"})
        fake_firebase_admin.initialize_app.assert_called_once_with("fake-cred")
        assert mod._initialized is True
        assert mod._firebase_app == "fake-app"

    def test_initializes_from_file_path_when_not_json(self, monkeypatch: pytest.MonkeyPatch) -> None:
        set_auth_type(monkeypatch, "firebase")
        monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT", "/path/to/service-account.json")

        fake_firebase_admin = MagicMock()
        fake_firebase_admin.app._apps = {}
        fake_firebase_admin.initialize_app.return_value = "fake-app"
        fake_credentials = MagicMock()
        fake_credentials.Certificate.return_value = "fake-cred"
        fake_firebase_admin.credentials = fake_credentials

        with patch.dict("sys.modules", {
            "firebase_admin": fake_firebase_admin,
            "firebase_admin.credentials": fake_credentials,
        }):
            from app.platform.auth.providers.firebase_provider import _ensure_initialized

            _ensure_initialized()

        fake_credentials.Certificate.assert_called_once_with("/path/to/service-account.json")

    def test_reuses_existing_app_when_already_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        set_auth_type(monkeypatch, "firebase")
        monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT", json.dumps({"type": "service_account"}))

        fake_firebase_admin = MagicMock()
        fake_firebase_admin.app._apps = {"[DEFAULT]": "existing"}
        fake_firebase_admin.get_app.return_value = "existing-app"
        fake_credentials = MagicMock()
        fake_credentials.Certificate.return_value = "fake-cred"
        fake_firebase_admin.credentials = fake_credentials

        with patch.dict("sys.modules", {
            "firebase_admin": fake_firebase_admin,
            "firebase_admin.credentials": fake_credentials,
        }):
            import app.platform.auth.providers.firebase_provider as mod
            from app.platform.auth.providers.firebase_provider import _ensure_initialized

            _ensure_initialized()

        fake_firebase_admin.initialize_app.assert_not_called()
        fake_firebase_admin.get_app.assert_called_once()
        assert mod._firebase_app == "existing-app"


class TestVerifyFirebaseToken:
    @pytest.mark.asyncio
    async def test_returns_claims_from_top_level_fields(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import app.platform.auth.providers.firebase_provider as mod

        mod._initialized = True
        fake_auth = MagicMock()
        fake_auth.verify_id_token.return_value = {
            "uid": "user-1",
            "email": "a@example.com",
            "role": "teacher",
            "tenant_id": "tenant-1",
        }

        with patch.dict("sys.modules", {"firebase_admin.auth": fake_auth}):
            result = await mod.verify_firebase_token("fake-token")

        assert result == {
            "uid": "user-1",
            "email": "a@example.com",
            "role": "teacher",
            "tenant_id": "tenant-1",
        }
        fake_auth.verify_id_token.assert_called_once_with("fake-token")

    @pytest.mark.asyncio
    async def test_falls_back_to_nested_claims(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import app.platform.auth.providers.firebase_provider as mod

        mod._initialized = True
        fake_auth = MagicMock()
        fake_auth.verify_id_token.return_value = {
            "uid": "user-1",
            "email": "a@example.com",
            "claims": {"role": "admin", "tenant_id": "tenant-2"},
        }

        with patch.dict("sys.modules", {"firebase_admin.auth": fake_auth}):
            result = await mod.verify_firebase_token("fake-token")

        assert result["role"] == "admin"
        assert result["tenant_id"] == "tenant-2"

    @pytest.mark.asyncio
    async def test_missing_optional_fields_default_to_empty_string(self) -> None:
        import app.platform.auth.providers.firebase_provider as mod

        mod._initialized = True
        fake_auth = MagicMock()
        fake_auth.verify_id_token.return_value = {"uid": "user-1"}

        with patch.dict("sys.modules", {"firebase_admin.auth": fake_auth}):
            result = await mod.verify_firebase_token("fake-token")

        assert result == {"uid": "user-1", "email": "", "role": "", "tenant_id": ""}

    @pytest.mark.asyncio
    async def test_propagates_native_exception_on_invalid_token(self) -> None:
        import app.platform.auth.providers.firebase_provider as mod

        mod._initialized = True
        fake_auth = MagicMock()
        fake_auth.verify_id_token.side_effect = ValueError("Invalid token")

        with patch.dict("sys.modules", {"firebase_admin.auth": fake_auth}):
            with pytest.raises(ValueError, match="Invalid token"):
                await mod.verify_firebase_token("bad-token")

    @pytest.mark.asyncio
    async def test_calls_ensure_initialized_first(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import app.platform.auth.providers.firebase_provider as mod

        called: dict[str, bool] = {"ensure": False}

        def fake_ensure() -> None:
            called["ensure"] = True
            mod._initialized = True

        fake_auth = MagicMock()
        fake_auth.verify_id_token.return_value = {"uid": "user-1"}

        with patch.object(mod, "_ensure_initialized", side_effect=fake_ensure), \
                patch.dict("sys.modules", {"firebase_admin.auth": fake_auth}):
            await mod.verify_firebase_token("fake-token")

        assert called["ensure"] is True
