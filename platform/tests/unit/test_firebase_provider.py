"""Tests for app.platform.auth.providers.firebase_provider."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

import app.platform.auth.providers.firebase_provider as mod
from app.platform.settings import get_settings


@pytest.fixture(autouse=True)
def reset_firebase_module_state(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(mod, "_firebase_app", None)
    monkeypatch.setattr(mod, "_initialized", False)
    yield


def set_auth_type(monkeypatch: pytest.MonkeyPatch, auth_type: str) -> None:
    monkeypatch.setenv("AUTH_TYPE", auth_type)
    get_settings.cache_clear()


class TestEnsureInitialized:
    def test_already_initialized_returns_immediately(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mod, "_initialized", True)
        with patch("app.platform.settings.get_settings") as mock_get_settings:
            mod._ensure_initialized()
        mock_get_settings.assert_not_called()

    def test_raises_when_auth_type_not_firebase(self, monkeypatch: pytest.MonkeyPatch) -> None:
        set_auth_type(monkeypatch, "jwt")

        with pytest.raises(RuntimeError, match="AUTH_TYPE is not 'firebase'"):
            mod._ensure_initialized()

    def test_raises_when_service_account_not_configured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        set_auth_type(monkeypatch, "firebase")
        monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT", "")

        with pytest.raises(RuntimeError, match="FIREBASE_SERVICE_ACCOUNT is not configured"):
            mod._ensure_initialized()

    @pytest.mark.parametrize(
        ("service_account_raw", "expected_cert_arg"),
        [
            pytest.param(
                json.dumps({"type": "service_account"}), {"type": "service_account"}, id="json_string",
            ),
            pytest.param(
                "/path/to/service-account.json", "/path/to/service-account.json", id="file_path",
            ),
        ],
    )
    def test_initializes_new_app(
        self, monkeypatch: pytest.MonkeyPatch, service_account_raw: str, expected_cert_arg: object,
    ) -> None:
        set_auth_type(monkeypatch, "firebase")
        monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT", service_account_raw)

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
            mod._ensure_initialized()

        fake_credentials.Certificate.assert_called_once_with(expected_cert_arg)
        fake_firebase_admin.initialize_app.assert_called_once_with("fake-cred")
        fake_firebase_admin.get_app.assert_not_called()
        assert mod._initialized is True
        assert mod._firebase_app == "fake-app"

    @pytest.mark.parametrize(
        "bad_json",
        [
            pytest.param('{"type": "service_account",}', id="trailing_comma"),
            pytest.param('{"type": "service_accou', id="truncated"),
        ],
    )
    def test_malformed_inline_json_fails_clearly(self, monkeypatch: pytest.MonkeyPatch, bad_json: str) -> None:
        set_auth_type(monkeypatch, "firebase")
        monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT", bad_json)

        fake_firebase_admin = MagicMock()
        fake_firebase_admin.app._apps = {}
        fake_credentials = MagicMock()
        fake_firebase_admin.credentials = fake_credentials

        with (
            patch.dict("sys.modules", {
                "firebase_admin": fake_firebase_admin,
                "firebase_admin.credentials": fake_credentials,
            }),
            pytest.raises(RuntimeError, match="FIREBASE_SERVICE_ACCOUNT looks like inline JSON"),
        ):
            mod._ensure_initialized()

        fake_credentials.Certificate.assert_not_called()

    def test_nonexistent_file_path_error_propagates(self, monkeypatch: pytest.MonkeyPatch) -> None:
        set_auth_type(monkeypatch, "firebase")
        monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT", "/no/such/service-account.json")

        fake_firebase_admin = MagicMock()
        fake_firebase_admin.app._apps = {}
        fake_credentials = MagicMock()
        fake_credentials.Certificate.side_effect = FileNotFoundError(
            "[Errno 2] No such file or directory: '/no/such/service-account.json'"
        )
        fake_firebase_admin.credentials = fake_credentials

        with (
            patch.dict("sys.modules", {
                "firebase_admin": fake_firebase_admin,
                "firebase_admin.credentials": fake_credentials,
            }),
            pytest.raises(FileNotFoundError, match="No such file or directory"),
        ):
            mod._ensure_initialized()

        fake_credentials.Certificate.assert_called_once_with("/no/such/service-account.json")
        fake_firebase_admin.initialize_app.assert_not_called()

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
            mod._ensure_initialized()

        fake_firebase_admin.initialize_app.assert_not_called()
        fake_firebase_admin.get_app.assert_called_once()
        assert mod._firebase_app == "existing-app"


class TestVerifyFirebaseToken:
    @pytest.mark.asyncio
    async def test_returns_claims_from_top_level_fields(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mod, "_initialized", True)
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
    @pytest.mark.parametrize(
        ("decoded", "expected_role", "expected_tenant"),
        [
            pytest.param(
                {"role": "admin", "tenant_id": "tenant-2"}, "admin", "tenant-2", id="top_level",
            ),
            pytest.param(
                {"claims": {"role": "admin", "tenant_id": "tenant-2"}}, "admin", "tenant-2", id="nested",
            ),
        ],
    )
    async def test_role_and_tenant_from_top_level_or_nested_claims(
        self,
        monkeypatch: pytest.MonkeyPatch,
        decoded: dict,
        expected_role: str,
        expected_tenant: str,
    ) -> None:
        monkeypatch.setattr(mod, "_initialized", True)
        fake_auth = MagicMock()
        fake_auth.verify_id_token.return_value = {
            "uid": "user-1",
            "email": "a@example.com",
            **decoded,
        }

        with patch.dict("sys.modules", {"firebase_admin.auth": fake_auth}):
            result = await mod.verify_firebase_token("fake-token")

        assert result["role"] == expected_role
        assert result["tenant_id"] == expected_tenant

    @pytest.mark.asyncio
    async def test_missing_optional_fields_default_to_empty_string(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mod, "_initialized", True)
        fake_auth = MagicMock()
        fake_auth.verify_id_token.return_value = {"uid": "user-1"}

        with patch.dict("sys.modules", {"firebase_admin.auth": fake_auth}):
            result = await mod.verify_firebase_token("fake-token")

        assert result == {"uid": "user-1", "email": "", "role": "", "tenant_id": ""}

    @pytest.mark.asyncio
    async def test_raises_when_uid_missing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mod, "_initialized", True)
        fake_auth = MagicMock()
        fake_auth.verify_id_token.return_value = {"email": "a@example.com"}

        with patch.dict("sys.modules", {"firebase_admin.auth": fake_auth}):
            with pytest.raises(KeyError):
                await mod.verify_firebase_token("fake-token")

    @pytest.mark.asyncio
    async def test_propagates_native_exception_on_invalid_token(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(mod, "_initialized", True)
        fake_auth = MagicMock()
        fake_auth.verify_id_token.side_effect = ValueError("Invalid token")

        with patch.dict("sys.modules", {"firebase_admin.auth": fake_auth}):
            with pytest.raises(ValueError, match="Invalid token"):
                await mod.verify_firebase_token("bad-token")

    @pytest.mark.asyncio
    async def test_calls_ensure_initialized_first(self, monkeypatch: pytest.MonkeyPatch) -> None:
        order: list[str] = []

        def fake_ensure() -> None:
            order.append("ensure")
            monkeypatch.setattr(mod, "_initialized", True)

        fake_auth = MagicMock()

        def fake_verify(token: str) -> dict[str, str]:
            order.append("verify")
            return {"uid": "user-1"}

        fake_auth.verify_id_token.side_effect = fake_verify

        with patch.object(mod, "_ensure_initialized", side_effect=fake_ensure), \
                patch.dict("sys.modules", {"firebase_admin.auth": fake_auth}):
            await mod.verify_firebase_token("fake-token")

        assert order == ["ensure", "verify"]
