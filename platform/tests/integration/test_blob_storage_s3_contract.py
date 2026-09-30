"""
Contract tests for the S3 blob storage provider against a real MinIO server.

Needs MinIO at http://localhost:9000 with the buckets output-container and
experience-titles. Start it with C:/A4I/mock-services/minio/docker-compose.yml.
Each MinIO test skips when the server does not answer.
"""

from __future__ import annotations

import io
import uuid
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.providers.blob_storage import _parse_blob_url

MINIO_URL = "http://localhost:9000"
BUCKETS = ["output-container", "experience-titles"]


def _minio_ready() -> bool:
    try:
        return httpx.get(f"{MINIO_URL}/minio/health/ready", timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


@pytest.fixture
def provider(monkeypatch):
    if not _minio_ready():
        pytest.skip(f"MinIO is not reachable at {MINIO_URL}/minio/health/ready. Start the MinIO compose file.")
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_ENDPOINT_URL", MINIO_URL)
    monkeypatch.setenv("S3_ACCESS_KEY_ID", "test-access-key")
    monkeypatch.setenv("S3_SECRET_ACCESS_KEY", "test-secret-key")
    monkeypatch.setenv("S3_REGION", "us-east-1")

    from app.providers.blob_storage import get_blob_storage_provider
    from app.providers.s3_blob_storage import S3BlobStorageProvider

    p = get_blob_storage_provider()
    assert isinstance(p, S3BlobStorageProvider)
    return p


@pytest.fixture(params=BUCKETS)
async def blob(request, provider):
    bucket = request.param
    name = f"contract-tests/{uuid.uuid4().hex}/clip one é.mp3"
    yield bucket, name
    await provider.delete_blob(bucket, name)


async def _get(url: str) -> httpx.Response:
    async with httpx.AsyncClient() as client:
        return await client.get(url)


class TestUploadDownload:
    async def test_upload_returns_url_and_download_returns_same_bytes(self, provider, blob) -> None:
        bucket, name = blob
        url = await provider.upload_file(bucket, name, b"hello-bytes", "audio/mpeg")

        assert _parse_blob_url(url) == (bucket, name)
        assert url.startswith(f"{MINIO_URL}/{bucket}/")
        assert await provider.download_file(bucket, name) == b"hello-bytes"

    async def test_upload_accepts_a_binary_stream(self, provider, blob) -> None:
        bucket, name = blob
        await provider.upload_file(bucket, name, io.BytesIO(b"streamed"), "audio/mpeg")

        assert await provider.download_file(bucket, name) == b"streamed"

    async def test_upload_overwrites_existing_blob(self, provider, blob) -> None:
        bucket, name = blob
        await provider.upload_file(bucket, name, b"first")
        await provider.upload_file(bucket, name, b"second")

        assert await provider.download_file(bucket, name) == b"second"

    async def test_content_type_is_stored(self, provider, blob) -> None:
        bucket, name = blob
        await provider.upload_file(bucket, name, b"x", "audio/mpeg")

        response = await _get(await provider.generate_sas_url(bucket, name))

        assert response.headers["content-type"] == "audio/mpeg"

    async def test_download_missing_blob_raises(self, provider) -> None:
        with pytest.raises(Exception):  # noqa: B017 - provider-specific not-found error
            await provider.download_file("output-container", f"contract-tests/missing-{uuid.uuid4().hex}")

    async def test_download_from_url_uses_url_returned_by_upload(self, provider, blob) -> None:
        bucket, name = blob
        url = await provider.upload_file(bucket, name, b"by-url")

        assert await provider.download_from_url(url) == b"by-url"

    async def test_blob_url_matches_upload_url(self, provider, blob) -> None:
        bucket, name = blob
        url = await provider.upload_file(bucket, name, b"x")

        assert provider.blob_url(bucket, name) == url


class TestExistsAndDelete:
    async def test_exists_follows_upload_and_delete(self, provider, blob) -> None:
        bucket, name = blob
        assert await provider.exists(bucket, name) is False

        await provider.upload_file(bucket, name, b"x")
        assert await provider.exists(bucket, name) is True

        assert await provider.delete_blob(bucket, name) is True
        assert await provider.exists(bucket, name) is False

    async def test_delete_missing_blob_returns_false(self, provider) -> None:
        assert await provider.delete_blob("output-container", f"contract-tests/missing-{uuid.uuid4().hex}") is False

    async def test_exists_is_false_for_missing_bucket(self, provider) -> None:
        assert await provider.exists(f"no-such-bucket-{uuid.uuid4().hex[:8]}", "a.mp3") is False


class TestDownloadLink:
    async def test_link_serves_the_blob_to_a_plain_http_client(self, provider, blob) -> None:
        bucket, name = blob
        await provider.upload_file(bucket, name, b"link-bytes")

        response = await _get(await provider.generate_sas_url(bucket, name))

        assert response.status_code == 200
        assert response.content == b"link-bytes"

    async def test_link_expires_after_the_requested_hours(self, provider, blob) -> None:
        bucket, name = blob
        url = await provider.generate_sas_url(bucket, name, expiry_hours=2)

        assert parse_qs(urlparse(url).query)["X-Amz-Expires"] == ["7200"]

    async def test_link_for_missing_blob_fails(self, provider) -> None:
        url = await provider.generate_sas_url("output-container", f"contract-tests/missing-{uuid.uuid4().hex}")

        assert (await _get(url)).status_code == 404

    async def test_tampered_link_is_rejected(self, provider, blob) -> None:
        bucket, name = blob
        await provider.upload_file(bucket, name, b"secret")
        url = await provider.generate_sas_url(bucket, name)

        assert (await _get(url.replace("X-Amz-Signature=", "X-Amz-Signature=0"))).status_code == 403

    async def test_link_from_blob_url_serves_the_blob(self, provider, blob) -> None:
        bucket, name = blob
        blob_url = await provider.upload_file(bucket, name, b"from-url")

        response = await _get(await provider.get_sas_url_from_blob_url(blob_url))

        assert response.content == b"from-url"

    async def test_link_from_old_azure_url_serves_the_blob(self, provider, blob) -> None:
        bucket, name = blob
        await provider.upload_file(bucket, name, b"legacy")
        old_url = f"https://oldaccount.blob.core.windows.net/{bucket}/{name.replace(' ', '%20')}"

        response = await _get(await provider.get_sas_url_from_blob_url(old_url))

        assert response.content == b"legacy"

    async def test_sync_link_serves_the_blob(self, provider, blob) -> None:
        bucket, name = blob
        await provider.upload_file(bucket, name, b"sync-bytes")

        response = await _get(provider.generate_sas_url_sync(bucket, name))

        assert response.content == b"sync-bytes"


class TestUploadLink:
    async def test_bytes_put_to_the_link_can_be_downloaded(self, provider, blob) -> None:
        bucket, name = blob
        url = await provider.get_upload_sas_url(bucket, name)

        async with httpx.AsyncClient() as client:
            response = await client.put(url, content=b"client-upload")

        assert response.status_code == 200
        assert await provider.download_file(bucket, name) == b"client-upload"

    async def test_upload_link_does_not_allow_get(self, provider, blob) -> None:
        bucket, name = blob
        await provider.upload_file(bucket, name, b"x")
        url = await provider.get_upload_sas_url(bucket, name)

        assert (await _get(url)).status_code == 403


class TestAudioCaptureUpload:
    async def test_captured_wav_is_uploaded_to_the_bucket(self, provider, tmp_path) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        settings = SimpleNamespace(
            audio_capture_enabled=True,
            audio_capture_upload_to_azure=True,
            audio_capture_container="audio-recording",
            audio_capture_delete_local_after_upload=True,
            audio_capture_dir=str(tmp_path),
        )
        service = AudioCaptureService(f"contract-{uuid.uuid4().hex[:8]}", settings=settings)
        service.write_chunk(b"\x00\x01" * 800)

        url = await service.finalize()

        assert url is not None
        try:
            assert (await provider.download_from_url(url))[:4] == b"RIFF"
        finally:
            container, blob_name = _parse_blob_url(url)
            await provider.delete_blob(container, blob_name)


class TestUrlParsing:
    """Pure parsing checks. These do not need MinIO."""

    OLD_AZURE = "https://acct.blob.core.windows.net/output-container/content-1/1.0.mp3"
    S3_PATH_STYLE = "http://localhost:9000/output-container/content-1/1.0.mp3"

    @pytest.mark.parametrize("url", [OLD_AZURE, S3_PATH_STYLE])
    def test_both_hosts_parse_to_the_same_container_and_blob(self, url) -> None:
        assert _parse_blob_url(url) == ("output-container", "content-1/1.0.mp3")

    @pytest.mark.parametrize("url", [OLD_AZURE, S3_PATH_STYLE])
    def test_extract_blob_path_without_extension(self, url) -> None:
        from app.providers.s3_blob_storage import S3BlobStorageProvider

        provider = S3BlobStorageProvider.__new__(S3BlobStorageProvider)

        assert provider.extract_blob_path_without_extension(url) == "content-1/1.0"

    def test_percent_encoded_names_are_decoded(self) -> None:
        url = "http://localhost:9000/experience-titles/a%20b/caf%C3%A9.mp3"

        assert _parse_blob_url(url) == ("experience-titles", "a b/café.mp3")

    def test_query_string_is_ignored(self) -> None:
        url = "https://acct.blob.core.windows.net/output-container/a.mp3?sv=2024&sig=abc"

        assert _parse_blob_url(url) == ("output-container", "a.mp3")

    @pytest.mark.parametrize("url", ["http://localhost:9000/", "http://localhost:9000/only-bucket"])
    def test_url_without_blob_path_is_rejected(self, url) -> None:
        with pytest.raises(ValueError, match="Invalid blob URL format"):
            _parse_blob_url(url)
