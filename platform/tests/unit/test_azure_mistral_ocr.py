from __future__ import annotations

import base64
import uuid

import pytest
from omni_ingest.core.model import KnowledgeItem, ResolvedResource, StepStatus
from omni_ingest.core.pipeline import IngestionContext

from app.remediation import azure_mistral_ocr


def _data_uri(raw: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


class _FakeImage:
    def __init__(self, image_id: str, raw: bytes):
        self.id = image_id
        self.top_left_x = 1
        self.top_left_y = 2
        self.bottom_right_x = 10
        self.bottom_right_y = 20
        self.image_base64 = _data_uri(raw)


class _FakeDimensions:
    dpi = 200
    width = 1000
    height = 1500


class _FakePage:
    def __init__(self, markdown, images, header=None, footer=None):
        self.markdown = markdown
        self.images = images
        self.dimensions = _FakeDimensions()
        self.header = header
        self.footer = footer


class _FakeResult:
    def __init__(self, pages):
        self.pages = pages


class _FakeOcr:
    def __init__(self, results_by_content: dict[bytes, _FakeResult], sent_kwargs: list[dict]):
        self._results = results_by_content
        self._sent_kwargs = sent_kwargs

    async def process_async(self, *, model, document, **kwargs):
        self._sent_kwargs.append(kwargs)
        raw = base64.b64decode(document.document_url.split(",", 1)[1])
        return self._results[raw]


class _FakeMistralAzure:
    results: dict[bytes, _FakeResult] = {}
    sent_kwargs: list[dict] = []

    def __init__(self, api_key, server_url):
        self.ocr = _FakeOcr(type(self).results, type(self).sent_kwargs)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


@pytest.fixture(autouse=True)
def _fake_settings(monkeypatch):
    monkeypatch.setattr(
        azure_mistral_ocr,
        "get_settings",
        lambda: type("S", (), {"mistral_ocr_api_key": "k", "mistral_ocr_endpoint": "e"})(),
    )
    monkeypatch.setattr(azure_mistral_ocr, "MistralAzure", _FakeMistralAzure)


def _make_ctx(page1: bytes, page2: bytes) -> tuple[IngestionContext, KnowledgeItem, KnowledgeItem]:
    item1 = KnowledgeItem(
        id=uuid.uuid4(), raw_content=page1, content_encoding="binary",
        metadata={"page": 1, "content_type": "application/pdf"},
    )
    item2 = KnowledgeItem(
        id=uuid.uuid4(), raw_content=page2, content_encoding="binary",
        metadata={"page": 2, "content_type": "application/pdf"},
    )
    ctx = IngestionContext(resource=ResolvedResource(uri="", raw_content=b""), items=[item1, item2])
    return ctx, item1, item2


def _agent(**kwargs) -> azure_mistral_ocr.AzureMistralOcrAgent:
    fields = {
        "engine": azure_mistral_ocr.ENGINE_NAME,
        "concurrency": 2,
        "extract_images": True,
        "image_min_size": 40,
        "extract_header_footer": True,
        "deduplicate": True,
        **kwargs,
    }
    return azure_mistral_ocr.AzureMistralOcrAgent(**fields)


@pytest.mark.asyncio
async def test_azure_mistral_ocr_creates_images_and_dedupes(monkeypatch):
    page1_bytes, page2_bytes = b"PAGE-1", b"PAGE-2"
    img_a, img_b, img_c = b"IMG-A-BYTES", b"IMG-B-BYTES", b"IMG-B-BYTES"

    _FakeMistralAzure.results = {
        page1_bytes: _FakeResult([
            _FakePage(
                "![img-0.jpeg](img-0.jpeg)\n\ntext a\n\n![img-1.jpeg](img-1.jpeg)",
                [_FakeImage("img-0.jpeg", img_a), _FakeImage("img-1.jpeg", img_b)],
                header="Chapter 1",
            )
        ]),
        page2_bytes: _FakeResult([
            _FakePage("![img-0.jpeg](img-0.jpeg)", [_FakeImage("img-0.jpeg", img_c)], footer="Page 2 footer"),
        ]),
    }

    ctx, item1, item2 = _make_ctx(page1_bytes, page2_bytes)
    result = await _agent().run(ctx)

    assert result.status == StepStatus.SUCCESS
    assert len(ctx.items) == 4

    images = [i for i in ctx.items if i.metadata.get("kind") == "image"]
    assert len(images) == 2

    md1 = item1.raw_content.decode("utf-8")
    md2 = item2.raw_content.decode("utf-8")
    marker_ids_page1 = {img.metadata["parent_id"] for img in images} & {str(item1.id)}
    assert marker_ids_page1 == {str(item1.id)}

    img_a_item = next(i for i in images if i.metadata["parent_id"] == str(item1.id) and i.raw_content == img_a)
    img_b_item = next(i for i in images if i.raw_content == img_b)

    assert f'<image id="{img_a_item.id}"/>' in md1
    assert f'<image id="{img_b_item.id}"/>' in md1
    assert f'<image id="{img_b_item.id}"/>' in md2

    assert img_a_item.metadata["page"] == 1
    assert img_a_item.metadata["bbox"] == [1, 2, 10, 20]
    assert img_a_item.metadata["content_type"] == "image/jpeg"
    assert img_a_item.metadata["source"] == "mistral_ocr"
    assert img_a_item.metadata["page_dimensions"] == {"dpi": 200, "width": 1000, "height": 1500}
    assert img_a_item.content_encoding == "binary"

    assert img_b_item.metadata["parent_id"] in {str(item1.id), str(item2.id)}

    assert item1.metadata["ocr_header"] == "Chapter 1"
    assert item2.metadata["ocr_footer"] == "Page 2 footer"


@pytest.mark.asyncio
async def test_azure_mistral_ocr_fails_loud_on_unknown_image_ref():
    page_bytes = b"PAGE-1"
    _FakeMistralAzure.results = {
        page_bytes: _FakeResult([_FakePage("![img-0.jpeg](img-0.jpeg)", [])]),
    }
    item = KnowledgeItem(
        id=uuid.uuid4(), raw_content=page_bytes, content_encoding="binary",
        metadata={"page": 1, "content_type": "application/pdf"},
    )
    ctx = IngestionContext(resource=ResolvedResource(uri="", raw_content=b""), items=[item])

    with pytest.raises(RuntimeError, match="img-0.jpeg"):
        await _agent().run(ctx)


@pytest.mark.asyncio
async def test_azure_mistral_ocr_fails_loud_on_image_without_data():
    page_bytes = b"PAGE-1"
    image = _FakeImage("img-0.jpeg", b"x")
    image.image_base64 = None
    _FakeMistralAzure.results = {
        page_bytes: _FakeResult([_FakePage("![img-0.jpeg](img-0.jpeg)", [image])]),
    }
    item = KnowledgeItem(
        id=uuid.uuid4(), raw_content=page_bytes, content_encoding="binary",
        metadata={"page": 1, "content_type": "application/pdf"},
    )
    ctx = IngestionContext(resource=ResolvedResource(uri="", raw_content=b""), items=[item])

    with pytest.raises(RuntimeError, match="without image data"):
        await _agent().run(ctx)


@pytest.mark.asyncio
async def test_azure_mistral_ocr_keeps_duplicates_when_deduplicate_false():
    page1_bytes, page2_bytes = b"PAGE-1", b"PAGE-2"
    img_a, img_b = b"IMG-SAME-BYTES", b"IMG-SAME-BYTES"

    _FakeMistralAzure.results = {
        page1_bytes: _FakeResult([_FakePage("![img-0.jpeg](img-0.jpeg)", [_FakeImage("img-0.jpeg", img_a)])]),
        page2_bytes: _FakeResult([_FakePage("![img-0.jpeg](img-0.jpeg)", [_FakeImage("img-0.jpeg", img_b)])]),
    }

    ctx, item1, item2 = _make_ctx(page1_bytes, page2_bytes)
    result = await _agent(deduplicate=False).run(ctx)

    assert result.status == StepStatus.SUCCESS
    images = [i for i in ctx.items if i.metadata.get("kind") == "image"]
    assert len(images) == 2


@pytest.mark.asyncio
async def test_azure_mistral_ocr_extract_images_false_creates_no_items():
    page_bytes = b"PAGE-1"
    _FakeMistralAzure.results = {
        page_bytes: _FakeResult([_FakePage("![img-0.jpeg](img-0.jpeg)", [_FakeImage("img-0.jpeg", b"IMG")])]),
    }
    _FakeMistralAzure.sent_kwargs = []
    item = KnowledgeItem(
        id=uuid.uuid4(), raw_content=page_bytes, content_encoding="binary",
        metadata={"page": 1, "content_type": "application/pdf"},
    )
    ctx = IngestionContext(resource=ResolvedResource(uri="", raw_content=b""), items=[item])

    result = await _agent(extract_images=False, extract_header_footer=False, deduplicate=False).run(ctx)

    assert result.status == StepStatus.SUCCESS
    assert len(ctx.items) == 1
    assert "![img-0.jpeg](img-0.jpeg)" in item.raw_content.decode("utf-8")
    assert _FakeMistralAzure.sent_kwargs == [{}]
