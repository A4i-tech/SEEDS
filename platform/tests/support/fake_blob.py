from __future__ import annotations

_URL_PREFIX = "https://blob.test/"


class FakeBlob:
    def __init__(self) -> None:
        self.uploaded: dict[str, bytes] = {}
        self.downloaded_urls: list[str] = []

    async def upload_file(
        self, container: str, blob_name: str, data: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        self.uploaded[blob_name] = data
        return f"{_URL_PREFIX}{container}/{blob_name}"

    async def download_from_url(self, url: str) -> bytes:
        self.downloaded_urls.append(url)
        _, _, blob_name = url.removeprefix(_URL_PREFIX).partition("/")
        return self.uploaded.get(blob_name, b"raw-bytes-from-" + url.encode("utf-8"))

    async def get_upload_sas_url(self, container: str, blob_name: str, expiry_hours: int = 1) -> str:
        return f"{_URL_PREFIX}{container}/{blob_name}?sas=1"
