from __future__ import annotations

import pytest

from app.aggregators.models import ItemType, NodeKind
from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreateRequest,
    PartnerContentUpdateRequest,
    PartnerQuizChoice,
    PartnerQuizQuestion,
)
from app.platform.error_handling import AppError, NotFoundError
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.services.content_aggregator.content import PartnerContentService
from tests.support.mongomock_async import AsyncMongoMockClient


class FakeBlob:
    def __init__(self):
        self.uploaded: dict[str, bytes] = {}

    async def upload_file(self, container, blob_name, data, content_type="application/octet-stream"):
        self.uploaded[blob_name] = data
        return f"https://blob.test/{container}/{blob_name}"

    async def download_from_url(self, url: str) -> bytes:
        return b"raw-bytes"

    async def get_upload_sas_url(self, container: str, blob_name: str, expiry_hours: int = 1) -> str:
        return f"https://blob.test/{container}/{blob_name}?sas=1"


@pytest.fixture
def service():
    client = AsyncMongoMockClient()
    repo = ContentAggregatorRepository(client["test_seeds"])
    return PartnerContentService(repo, FakeBlob(), "contentAggregators")


@pytest.mark.asyncio
async def test_create_upload_url_rejects_bad_extension(service):
    with pytest.raises(AppError) as exc:
        await service.create_upload_url("file.pdf")
    assert exc.value.code == "UNSUPPORTED_TYPE"


@pytest.mark.asyncio
async def test_create_upload_url_returns_sas_for_mp3(service):
    url = await service.create_upload_url("story.mp3")
    assert url == "https://blob.test/input-container/story.mp3?sas=1"


@pytest.mark.asyncio
async def test_create_item_rejects_unsupported_type(service):
    body = PartnerContentCreateRequest(type="video", language="en", display_name="X")
    with pytest.raises(AppError) as exc:
        await service.create_item("tenant-a", "client-1", "item-1", body)
    assert exc.value.code == "UNSUPPORTED_TYPE"


@pytest.mark.asyncio
async def test_create_item_rejects_unsupported_language(service):
    body = PartnerContentCreateRequest(type="notes", language="xx", display_name="X", text="hi")
    with pytest.raises(AppError) as exc:
        await service.create_item("tenant-a", "client-1", "item-1", body)
    assert exc.value.code == "UNSUPPORTED_LANGUAGE"


def test_create_request_rejects_non_https_audio_url():
    with pytest.raises(AppError) as exc:
        PartnerContentCreateRequest(type="story", language="en", display_name="X", audio_url="http://x.example/a.mp3")
    assert exc.value.code == "URL_NOT_HTTPS"


def test_create_request_rejects_non_https_brf_url():
    with pytest.raises(AppError) as exc:
        PartnerContentCreateRequest(type="brf", language="en", display_name="X", brf_url="http://x.example/a.brf")
    assert exc.value.code == "URL_NOT_HTTPS"


@pytest.mark.asyncio
async def test_create_item_notes_stores_plaintext(service):
    body = PartnerContentCreateRequest(type="notes", language="en", display_name="My Notes", text="hello world")
    nodes = await service.create_item("tenant-a", "client-1", "item-1", body)
    assert len(nodes) == 1
    assert nodes[0].item_type == ItemType.PLAINTEXT
    assert nodes[0].client_id == "client-1"

    fetched = await service.get_item("tenant-a", "client-1", "item-1")
    assert fetched.display_name == "My Notes"


@pytest.mark.asyncio
async def test_create_item_story_moves_audio_blob(service):
    body = PartnerContentCreateRequest(type="story", language="en", display_name="A Story", audio_url="https://x.example/a.mp3")
    nodes = await service.create_item("tenant-a", "client-1", "item-1", body)
    assert nodes[0].item_type == ItemType.AUDIO
    assert nodes[0].content.audio_url == "https://blob.test/contentAggregators/partner/client-1/items/item-1.mp3"


@pytest.mark.asyncio
async def test_create_item_brf_stores_braille_grade(service):
    body = PartnerContentCreateRequest(
        type="brf", language="en", display_name="A Braille Doc",
        brf_url="https://x.example/b.brf", braille_grade=2,
    )
    nodes = await service.create_item("tenant-a", "client-1", "item-1", body)
    assert nodes[0].content.braille_grade == 2


@pytest.mark.asyncio
async def test_create_item_brf_back_translates_to_text(service, monkeypatch):
    monkeypatch.setattr(
        "app.services.content_aggregator.content.back_translate", lambda text, language, grade: "hello world"
    )
    body = PartnerContentCreateRequest(
        type="brf", language="en", display_name="A Braille Doc",
        brf_url="https://x.example/b.brf", braille_grade=1,
    )
    nodes = await service.create_item("tenant-a", "client-1", "item-1", body)
    assert nodes[0].content.text == "hello world"
    assert nodes[0].content.language == "en"


@pytest.mark.asyncio
async def test_update_item_braille_re_translates_on_new_brf_url(service, monkeypatch):
    monkeypatch.setattr(
        "app.services.content_aggregator.content.back_translate", lambda text, language, grade: "v1 text"
    )
    body = PartnerContentCreateRequest(
        type="brf", language="en", display_name="A Braille Doc",
        brf_url="https://x.example/b.brf", braille_grade=1,
    )
    await service.create_item("tenant-a", "client-1", "item-1", body)

    monkeypatch.setattr(
        "app.services.content_aggregator.content.back_translate", lambda text, language, grade: "v2 text"
    )
    updated = await service.update_item(
        "tenant-a", "client-1", "item-1",
        PartnerContentUpdateRequest(content={"brf_url": "https://x.example/b2.brf", "language": "en", "braille_grade": 1}),
    )
    assert updated.content.text == "v2 text"


@pytest.mark.asyncio
async def test_create_item_quiz_creates_container_plus_one_child_per_question(service):
    body = PartnerContentCreateRequest(
        type="quiz", language="en", display_name="Quiz One",
        questions=[
            PartnerQuizQuestion(text="2+2?", choices=[PartnerQuizChoice(text="3"), PartnerQuizChoice(text="4", correct=True)]),
            PartnerQuizQuestion(text="1+1?", choices=[PartnerQuizChoice(text="2", correct=True)]),
        ],
    )
    nodes = await service.create_item("tenant-a", "client-1", "quiz-1", body)
    assert len(nodes) == 3
    container = next(n for n in nodes if n.node_kind == NodeKind.CONTAINER)
    children = [n for n in nodes if n.node_kind == NodeKind.ITEM]
    assert container.source_id == "quiz-1"
    assert {c.source_id for c in children} == {"quiz-1:0", "quiz-1:1"}
    assert all(c.parent_id == "quiz-1" for c in children)
    q0 = next(c for c in children if c.source_id == "quiz-1:0")
    assert q0.content.question == "2+2?"
    assert q0.content.choices == [{"id": "0", "text": "3", "correct": False}, {"id": "1", "text": "4", "correct": True}]


@pytest.mark.asyncio
async def test_create_item_quiz_requires_at_least_one_question(service):
    body = PartnerContentCreateRequest(type="quiz", language="en", display_name="Empty Quiz", questions=[])
    with pytest.raises(AppError) as exc:
        await service.create_item("tenant-a", "client-1", "quiz-1", body)
    assert exc.value.code == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_create_item_is_idempotent_on_same_source_id(service):
    body = PartnerContentCreateRequest(type="notes", language="en", display_name="My Notes", text="v1")
    await service.create_item("tenant-a", "client-1", "item-1", body)
    body2 = PartnerContentCreateRequest(type="notes", language="en", display_name="My Notes v2", text="v2")
    await service.create_item("tenant-a", "client-1", "item-1", body2)

    items = await service.list_items("tenant-a", "client-1")
    assert len(items) == 1
    assert items[0].display_name == "My Notes v2"


@pytest.mark.asyncio
async def test_get_item_raises_not_found_for_other_client(service):
    body = PartnerContentCreateRequest(type="notes", language="en", display_name="X", text="hi")
    await service.create_item("tenant-a", "client-1", "item-1", body)
    with pytest.raises(NotFoundError):
        await service.get_item("tenant-a", "client-2", "item-1")


@pytest.mark.asyncio
async def test_get_status_returns_completed_when_present(service):
    body = PartnerContentCreateRequest(type="notes", language="en", display_name="X", text="hi")
    await service.create_item("tenant-a", "client-1", "item-1", body)
    assert await service.get_status("tenant-a", "client-1", "item-1") == "completed"


@pytest.mark.asyncio
async def test_get_status_raises_not_found_when_missing(service):
    with pytest.raises(NotFoundError):
        await service.get_status("tenant-a", "client-1", "missing")


@pytest.mark.asyncio
async def test_update_item_replaces_content(service):
    body = PartnerContentCreateRequest(type="notes", language="en", display_name="X", text="v1")
    await service.create_item("tenant-a", "client-1", "item-1", body)

    updated = await service.update_item(
        "tenant-a", "client-1", "item-1",
        PartnerContentUpdateRequest(content={"markdown_url": "https://blob.test/x.txt"}),
    )
    assert updated.content.markdown_url == "https://blob.test/x.txt"


@pytest.mark.asyncio
async def test_update_item_raises_not_found_for_other_client(service):
    body = PartnerContentCreateRequest(type="notes", language="en", display_name="X", text="v1")
    await service.create_item("tenant-a", "client-1", "item-1", body)
    with pytest.raises(NotFoundError):
        await service.update_item("tenant-a", "client-2", "item-1", PartnerContentUpdateRequest(content={}))


@pytest.mark.asyncio
async def test_delete_item_soft_deletes(service):
    body = PartnerContentCreateRequest(type="notes", language="en", display_name="X", text="v1")
    await service.create_item("tenant-a", "client-1", "item-1", body)

    await service.delete_item("tenant-a", "client-1", "item-1")

    with pytest.raises(NotFoundError):
        await service.get_item("tenant-a", "client-1", "item-1")


@pytest.mark.asyncio
async def test_delete_item_raises_not_found_when_already_deleted(service):
    body = PartnerContentCreateRequest(type="notes", language="en", display_name="X", text="v1")
    await service.create_item("tenant-a", "client-1", "item-1", body)
    await service.delete_item("tenant-a", "client-1", "item-1")
    with pytest.raises(NotFoundError):
        await service.delete_item("tenant-a", "client-1", "item-1")
