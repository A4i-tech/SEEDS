from __future__ import annotations

import pytest

from app.aggregators.content_strategies import STRATEGY_REGISTRY, TextStrategy
from app.aggregators.models import BlobContext, ItemType, VideoContent


class FakeBlob:
    def __init__(self):
        self.uploaded: dict[str, bytes] = {}

    async def upload_file(self, container, blob_name, data, content_type="application/octet-stream"):
        self.uploaded[blob_name] = data
        return f"https://blob.test/{container}/{blob_name}"


@pytest.mark.asyncio
async def test_text_strategy_uploads_markdown_only():
    blob = FakeBlob()
    ctx = BlobContext(container="subodha", blob_prefix="courses/c1/items/b1")

    content = await TextStrategy().process("<p><strong>Hi</strong></p>", ctx, blob)

    assert content.markdown_url == "https://blob.test/subodha/courses/c1/items/b1.md"
    assert content.html_url is None
    assert content.conversion_failed is False
    assert b"**Hi**" in blob.uploaded["courses/c1/items/b1.md"]
    assert "courses/c1/items/b1.html" not in blob.uploaded


@pytest.mark.asyncio
async def test_text_strategy_falls_back_on_pandoc_failure(monkeypatch):
    def boom(html):
        raise RuntimeError("pandoc exploded")

    monkeypatch.setattr("app.aggregators.content_strategies.html_to_markdown", boom)
    blob = FakeBlob()
    ctx = BlobContext(container="subodha", blob_prefix="courses/c1/items/b2")

    content = await TextStrategy().process("<p>raw</p>", ctx, blob)

    assert content.conversion_failed is True
    assert content.raw_html_url == "https://blob.test/subodha/courses/c1/items/b2.raw.html"
    assert blob.uploaded["courses/c1/items/b2.raw.html"] == b"<p>raw</p>"


@pytest.mark.asyncio
async def test_video_strategy_passes_through_student_view_data():
    student_view_data = {
        "sources": ["https://example.com/v.mp4"], "streams": "1.00:abc123",
        "poster": None, "transcriptLanguages": {"en": "English"},
    }
    content = await STRATEGY_REGISTRY[ItemType.VIDEO].process(student_view_data, BlobContext("subodha", "x"), None)
    assert content == VideoContent(
        sources=["https://example.com/v.mp4"], streams="1.00:abc123",
        poster_url=None, transcript_languages={"en": "English"},
    )


@pytest.mark.asyncio
async def test_quiz_strategy_uploads_raw_html_as_is():
    blob = FakeBlob()
    ctx = BlobContext(container="subodha", blob_prefix="courses/c1/items/q1")
    content = await STRATEGY_REGISTRY[ItemType.QUIZ].process("<div class='problems-wrapper'></div>", ctx, blob)
    assert content.raw_html_url == "https://blob.test/subodha/courses/c1/items/q1.raw.html"


@pytest.mark.asyncio
async def test_other_strategy_passes_through_dict_unchanged():
    payload = {"whatever": "shape", "the": "adapter emits"}
    content = await STRATEGY_REGISTRY[ItemType.OTHER].process(payload, BlobContext("subodha", "x"), None)
    assert content.payload == payload
