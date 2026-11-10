from unittest.mock import MagicMock

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
