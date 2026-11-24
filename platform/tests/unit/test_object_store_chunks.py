from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from app.providers.blob_storage import BlobNotFoundError
from app.providers.object_store_blob_storage import ObjectStoreBlobStorageProvider


class _Body:
    closed = False

    def iter_chunks(self, size):
        return iter([b"ab", b"cd"])

    def close(self):
        self.closed = True


async def test_download_chunks_streams_all_chunks_and_closes_body():
    body = _Body()
    provider = ObjectStoreBlobStorageProvider.__new__(ObjectStoreBlobStorageProvider)
    provider._client = MagicMock()
    provider._client.get_object.return_value = {"Body": body}
    provider._client.head_object.return_value = {"ContentLength": 4}

    chunks = [c async for c in await provider.download_chunks("b", "k")]

    assert chunks == [b"ab", b"cd"]
    assert body.closed
    assert await provider.blob_size("b", "k") == 4


@pytest.mark.parametrize("operation", ["blob_size", "download_file", "download_chunks"])
async def test_missing_blob_raises_blob_not_found(operation):
    provider = ObjectStoreBlobStorageProvider.__new__(ObjectStoreBlobStorageProvider)
    provider._client = MagicMock()
    error = ClientError({"Error": {"Code": "404"}}, "op")
    provider._client.get_object.side_effect = error
    provider._client.head_object.side_effect = error

    with pytest.raises(BlobNotFoundError):
        await getattr(provider, operation)("b", "k")


def _provider_failing_with(code):
    provider = ObjectStoreBlobStorageProvider.__new__(ObjectStoreBlobStorageProvider)
    provider._client = MagicMock()
    provider._client.head_object.side_effect = ClientError({"Error": {"Code": code}}, "op")
    return provider


async def test_exists_is_false_for_a_missing_blob():
    assert await _provider_failing_with("404").exists("b", "k") is False


@pytest.mark.parametrize("operation", ["exists", "blob_size"])
async def test_access_denied_is_not_reported_as_missing(operation):
    with pytest.raises(ClientError):
        await getattr(_provider_failing_with("AccessDenied"), operation)("b", "k")
