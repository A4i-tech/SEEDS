from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.consumers import content_job_consumer as consumer
from app.providers import subodha_client as sc_target
from app.providers.blob_storage import BlobStorageProvider
from app.providers.subodha_client import SubodhaClient
from app.services import subodha_service


class _Download:
    def __init__(self, parts):
        self._parts = parts

    async def readinto(self, fh):
        return sum(fh.write(part) for part in self._parts)

    async def readall(self):
        raise AssertionError("readall must not be called")


def _provider(parts):
    provider = BlobStorageProvider.__new__(BlobStorageProvider)
    blob_client = MagicMock()
    blob_client.download_blob = AsyncMock(return_value=_Download(parts))
    container_client = MagicMock()
    container_client.get_blob_client.return_value = blob_client
    provider._client = MagicMock()
    provider._client.get_container_client.return_value = container_client
    return provider


@pytest.mark.asyncio
async def test_download_from_url_to_file_writes_chunks(tmp_path):
    path = tmp_path / "out.bin"
    await _provider([b"ab", b"cd"]).download_from_url_to_file("https://acct.blob.core.windows.net/c/x/y.mp3", path)
    assert path.read_bytes() == b"abcd"


@pytest.mark.asyncio
async def test_process_audio_item_uploads_file_handle():
    uploaded = {}

    async def download(url, path):
        Path(path).write_bytes(b"in")
        return 2

    async def transcode(src, dst):
        Path(dst).write_bytes(b"wav")

    async def upload(container, name, data, content_type):
        uploaded["has_read"] = hasattr(data, "read")
        uploaded["bytes"] = data.read()
        return "https://new"

    provider = MagicMock()
    provider.download_from_url_to_file = download
    provider.upload_file = upload
    with patch.object(consumer, "_transcode_to_wav", transcode), patch.object(
        consumer, "_extract_duration", AsyncMock(return_value=1.5)
    ):
        url, duration = await consumer._process_audio_item("https://acct.blob.core.windows.net/c/a.mp3", "cid", provider)
    assert (url, duration) == ("https://new", 1.5)
    assert uploaded == {"has_read": True, "bytes": b"wav"}


def _client(handler):
    client = SubodhaClient.__new__(SubodhaClient)
    client._http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client._base_url = "https://lms"
    return client


@pytest.mark.asyncio
async def test_fetch_asset_streams_chunks_to_tempfile():
    handle = await _client(lambda r: httpx.Response(200, content=b"x" * 100)).fetch_asset("/a", "c=1")
    assert handle.tell() == 0
    assert handle.read() == b"x" * 100
    handle.close()


@pytest.mark.asyncio
async def test_fetch_asset_rejects_over_max_bytes(monkeypatch):
    monkeypatch.setattr(sc_target, "_MAX_ASSET_BYTES", 4)
    with pytest.raises(ValueError, match="asset too large"):
        await _client(lambda r: httpx.Response(200, content=b"x" * 100)).fetch_asset("/a", "c=1")


@pytest.mark.asyncio
async def test_upload_one_closes_handle_when_upload_fails(monkeypatch):
    handle = MagicMock()
    client = MagicMock()
    client.fetch_asset = AsyncMock(return_value=handle)
    provider = MagicMock()
    provider.exists = AsyncMock(return_value=False)
    provider.upload_file = AsyncMock(side_effect=RuntimeError("boom"))
    monkeypatch.setattr(subodha_service, "BlobStorageProvider", lambda: provider)
    blocks = {"blocks": {"b": {"student_view_html": '<img src="/asset-v1:o+c+r+type@asset+block@a.png">'}}}
    result = await subodha_service.fetch_and_store_assets(client, "course:1", blocks, "cookie")
    assert result == {}
    handle.close.assert_called_once()


@pytest.mark.asyncio
async def test_upload_one_closes_handle_on_success(monkeypatch):
    handle = MagicMock()
    client = MagicMock()
    client.fetch_asset = AsyncMock(return_value=handle)
    provider = MagicMock()
    provider.exists = AsyncMock(return_value=False)
    provider.upload_file = AsyncMock(return_value="https://blob.test/c/a.png")
    monkeypatch.setattr(subodha_service, "BlobStorageProvider", lambda: provider)
    blocks = {"blocks": {"b": {"student_view_html": '<img src="/asset-v1:o+c+r+type@asset+block@a.png">'}}}
    result = await subodha_service.fetch_and_store_assets(client, "course:1", blocks, "cookie")
    assert result == {"/asset-v1:o+c+r+type@asset+block@a.png": "https://blob.test/c/a.png"}
    handle.close.assert_called_once()
