from __future__ import annotations

import pytest

from app.consumers.content_job_consumer import _process_braille_item


class _FakeBlob:
    async def download_from_url(self, url: str) -> bytes:
        return b"raw-brf-bytes"

    async def upload_file(self, container, blob_name, data, content_type="application/octet-stream"):
        return f"https://blob.test/{container}/{blob_name}"

    async def delete_blob(self, container, blob_name) -> None:
        pass


@pytest.mark.asyncio
async def test_process_braille_item_returns_url_and_translated_text(monkeypatch):
    monkeypatch.setattr(
        "app.consumers.content_job_consumer.back_translate", lambda text, language, grade: "translated text"
    )
    new_url, text = await _process_braille_item(
        "https://blob.test/input-container/a.brf", "en", 2, _FakeBlob()
    )
    assert new_url == "https://blob.test/output-container/a.brf"
    assert text == "translated text"
