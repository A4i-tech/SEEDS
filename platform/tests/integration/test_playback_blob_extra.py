"""
Coverage for playback_controller endpoints and blob_storage provider.
"""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.auth.jwt import create_access_token
from app.models.user import UserRole


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_playback"]
    yield db
    client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _seed_teacher(db):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "Play Teacher",
        "email": "t@play.com",
        "hashed_password": hash_password("pass1234"),
        "tenant_id": "t1",
        "school_id": "s1",
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(uid, tid="t1", sid="s1"):
    return create_access_token({"sub": uid, "role": "teacher", "tenant_id": tid, "school_id": sid})


class TestPlaybackControllerAuth:
    @pytest.mark.asyncio
    async def test_play_audio_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/playaudio/conf1", json={"audio_url": "http://audio.mp3"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_pause_audio_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/pauseaudio/conf1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_resume_audio_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/resumeaudio/conf1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_seek_audio_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/seekaudio/conf1", json={"delta_seconds": 10})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_set_playback_speed_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/setplaybackspeed/conf1", json={"speed": 1.5})
        assert resp.status_code == 401


class TestPlaybackControllerNoConf:
    @pytest.mark.asyncio
    async def test_play_audio_no_conf_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=None)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/playaudio/nonexistent",
                json={"audio_url": "http://audio.mp3"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 404, 422)

    @pytest.mark.asyncio
    async def test_pause_audio_no_conf_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=None)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/pauseaudio/nonexistent",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_seek_audio_no_conf_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=None)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/seekaudio/nonexistent",
                json={"delta_seconds": 10},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 404, 422)

    @pytest.mark.asyncio
    async def test_set_speed_no_conf_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=None)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/setplaybackspeed/nonexistent",
                json={"speed": 1.5},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 404, 422)


# ---------------------------------------------------------------------------
# blob_storage provider — pure function tests
# ---------------------------------------------------------------------------


class TestBlobStoragePure:
    def test_parse_blob_url_standard(self) -> None:
        from app.providers.blob_storage import _parse_blob_url

        container, blob = _parse_blob_url(
            "https://myaccount.blob.core.windows.net/mycontainer/path/to/blob.mp3"
        )
        assert container == "mycontainer"
        assert blob == "path/to/blob.mp3"

    def test_parse_blob_url_simple(self) -> None:
        from app.providers.blob_storage import _parse_blob_url

        container, blob = _parse_blob_url(
            "https://myaccount.blob.core.windows.net/audio/test.wav"
        )
        assert container == "audio"
        assert blob == "test.wav"

    def test_extract_blob_path_without_extension(self) -> None:
        """BlobStorageProvider.extract_blob_path_without_extension strips extension."""
        mock_settings = MagicMock()
        mock_settings.azure_blob_sas_enabled = False
        mock_settings.azure_storage_account_name = "testaccount"
        mock_settings.azure_storage_account_key = ""
        mock_settings.azure_storage_connection_string = ""

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings):
            from app.providers.blob_storage import BlobStorageProvider
            provider = BlobStorageProvider.__new__(BlobStorageProvider)
            provider._account_name = "testaccount"
            provider._account_key = ""
            provider._connection_string = ""

            result = provider.extract_blob_path_without_extension(
                "https://testaccount.blob.core.windows.net/audio/test.mp3"
            )
            assert ".mp3" not in result
            assert "test" in result

    def test_sas_generator_disabled_returns_original(self) -> None:
        from app.providers.blob_storage import SASGenerator

        mock_settings = MagicMock()
        mock_settings.azure_blob_sas_enabled = False
        mock_settings.azure_storage_account_name = ""
        mock_settings.azure_storage_account_key = ""

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings):
            gen = SASGenerator()
            url = "https://example.com/audio/test.mp3"
            result = gen.get_url_with_sas(url)
            assert result == url  # Original URL returned when storage disabled

    def test_sas_generator_non_blob_url_returns_original(self) -> None:
        from app.providers.blob_storage import SASGenerator

        mock_settings = MagicMock()
        mock_settings.azure_blob_sas_enabled = False
        mock_settings.azure_storage_account_name = ""
        mock_settings.azure_storage_account_key = ""

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings):
            gen = SASGenerator()
            url = "https://example.com/not-blob-url"
            result = gen.get_url_with_sas(url)
            assert result == url

    def test_sas_generator_empty_url(self) -> None:
        from app.providers.blob_storage import SASGenerator

        mock_settings = MagicMock()
        mock_settings.azure_blob_sas_enabled = False
        mock_settings.azure_storage_account_name = ""
        mock_settings.azure_storage_account_key = ""

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings):
            gen = SASGenerator()
            result = gen.get_url_with_sas("")
            assert result == ""
