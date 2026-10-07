from __future__ import annotations

import pytest
from pydantic import TypeAdapter, ValidationError

from app.aggregators.models import ItemType, NodeKind
from app.models.requests.content_aggregator_content_requests import (
    AudioContentPatch,
    PartnerBrfCreate,
    PartnerContentCreateRequest,
    PartnerContentType,
    PartnerContentUpdateRequest,
    PartnerNotesCreate,
    PartnerQuizChoice,
    PartnerQuizCreate,
    PartnerQuizQuestion,
    PartnerStoryCreate,
    TextContentPatch,
)
from app.platform.error_handling import AppError, NotFoundError
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.services.content_aggregator.content import PartnerContentService
from tests.support.fake_blob import FakeBlob
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def service():
    client = AsyncMongoMockClient()
    repo = ContentAggregatorRepository(client["test_seeds"])
    return PartnerContentService(repo, FakeBlob(), "contentAggregators")


def _notes(text="hi", display_name="X", language="en"):
    return PartnerNotesCreate(type=PartnerContentType.NOTES, language=language, display_name=display_name, text=text)


@pytest.mark.asyncio
async def test_create_upload_url_rejects_bad_extension(service):
    with pytest.raises(AppError) as exc:
        await service.create_upload_url("file.pdf")
    assert exc.value.code == "UNSUPPORTED_TYPE"


@pytest.mark.asyncio
async def test_create_upload_url_returns_sas_for_mp3(service):
    url = await service.create_upload_url("story.mp3")
    assert url == "https://blob.test/input-container/story.mp3?sas=1"


def test_create_request_rejects_unsupported_type():
    with pytest.raises(ValidationError):
        TypeAdapter(PartnerContentCreateRequest).validate_python(
            {"type": "video", "language": "en", "display_name": "X"}
        )


def test_create_request_rejects_non_https_audio_url():
    with pytest.raises(ValidationError):
        PartnerStoryCreate(
            type=PartnerContentType.STORY, language="en", display_name="X", audio_url="http://x.example/a.mp3"
        )


def test_create_request_quiz_requires_at_least_one_question():
    with pytest.raises(ValidationError):
        PartnerQuizCreate(type=PartnerContentType.QUIZ, language="en", display_name="Empty Quiz", questions=[])


@pytest.mark.asyncio
async def test_create_item_rejects_unsupported_language(service):
    with pytest.raises(AppError) as exc:
        await service.create_item("tenant-a", "client-1", "item-1", _notes(language="xx"))
    assert exc.value.code == "UNSUPPORTED_LANGUAGE"


@pytest.mark.asyncio
async def test_create_item_notes_stores_plaintext(service):
    nodes = await service.create_item("tenant-a", "client-1", "item-1", _notes(text="hello world", display_name="My Notes"))
    assert len(nodes) == 1
    assert nodes[0].item_type == ItemType.PLAINTEXT
    assert nodes[0].root_id == "client-1"

    fetched = await service.get_item("tenant-a", "client-1", "item-1")
    assert fetched.display_name == "My Notes"


@pytest.mark.asyncio
async def test_create_item_story_moves_audio_blob(service):
    body = PartnerStoryCreate(
        type=PartnerContentType.STORY, language="en", display_name="A Story", audio_url="https://x.example/a.mp3"
    )
    nodes = await service.create_item("tenant-a", "client-1", "item-1", body)
    assert nodes[0].item_type == ItemType.AUDIO
    assert nodes[0].content.audio_url == "https://blob.test/contentAggregators/partner/client-1/items/item-1.mp3"


@pytest.mark.asyncio
async def test_create_item_brf_stores_braille_grade(service):
    body = PartnerBrfCreate(
        type=PartnerContentType.BRF, language="en", display_name="A Braille Doc",
        brf_url="https://x.example/b.brf", braille_grade=2,
    )
    nodes = await service.create_item("tenant-a", "client-1", "item-1", body)
    assert nodes[0].content.braille_grade == 2


@pytest.mark.asyncio
async def test_create_item_quiz_creates_container_plus_one_child_per_question(service):
    body = PartnerQuizCreate(
        type=PartnerContentType.QUIZ, language="en", display_name="Quiz One",
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
    assert q0.content.choices == [
        {"value": "0", "text": "3", "correct": False},
        {"value": "1", "text": "4", "correct": True},
    ]


@pytest.mark.asyncio
async def test_create_item_is_idempotent_on_same_source_id(service):
    await service.create_item("tenant-a", "client-1", "item-1", _notes(text="v1", display_name="My Notes"))
    await service.create_item("tenant-a", "client-1", "item-1", _notes(text="v2", display_name="My Notes v2"))

    items = await service.list_items("tenant-a", "client-1")
    assert len(items) == 1
    assert items[0].display_name == "My Notes v2"


@pytest.mark.asyncio
async def test_get_item_raises_not_found_for_other_client(service):
    await service.create_item("tenant-a", "client-1", "item-1", _notes())
    with pytest.raises(NotFoundError):
        await service.get_item("tenant-a", "client-2", "item-1")


@pytest.mark.asyncio
async def test_update_item_replaces_content(service):
    await service.create_item("tenant-a", "client-1", "item-1", _notes(text="v1"))

    updated = await service.update_item(
        "tenant-a", "client-1", "item-1",
        PartnerContentUpdateRequest(content=TextContentPatch(markdown_url="https://blob.test/x.txt")),
    )
    assert updated.content.markdown_url == "https://blob.test/x.txt"
    stored = await service.get_item("tenant-a", "client-1", "item-1")
    assert stored.content.markdown_url == "https://blob.test/x.txt"


@pytest.mark.asyncio
async def test_update_item_with_identical_content_is_not_a_404(service):
    await service.create_item("tenant-a", "client-1", "item-1", _notes(text="v1"))
    patch = PartnerContentUpdateRequest(content=TextContentPatch(markdown_url="https://blob.test/x.txt"))

    await service.update_item("tenant-a", "client-1", "item-1", patch)
    await service.update_item("tenant-a", "client-1", "item-1", patch)


@pytest.mark.asyncio
async def test_update_item_rejects_patch_of_wrong_content_type(service):
    await service.create_item("tenant-a", "client-1", "item-1", _notes(text="v1"))
    with pytest.raises(AppError) as exc:
        await service.update_item(
            "tenant-a", "client-1", "item-1",
            PartnerContentUpdateRequest(content=AudioContentPatch(audio_url="https://blob.test/a.mp3")),
        )
    assert exc.value.code == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_update_item_raises_not_found_for_other_client(service):
    await service.create_item("tenant-a", "client-1", "item-1", _notes(text="v1"))
    with pytest.raises(NotFoundError):
        await service.update_item(
            "tenant-a", "client-2", "item-1",
            PartnerContentUpdateRequest(content=TextContentPatch(markdown_url="https://blob.test/x.txt")),
        )


@pytest.mark.asyncio
async def test_delete_item_soft_deletes(service):
    await service.create_item("tenant-a", "client-1", "item-1", _notes(text="v1"))

    await service.delete_item("tenant-a", "client-1", "item-1")

    with pytest.raises(NotFoundError):
        await service.get_item("tenant-a", "client-1", "item-1")


@pytest.mark.asyncio
async def test_delete_item_raises_not_found_when_already_deleted(service):
    await service.create_item("tenant-a", "client-1", "item-1", _notes(text="v1"))
    await service.delete_item("tenant-a", "client-1", "item-1")
    with pytest.raises(NotFoundError):
        await service.delete_item("tenant-a", "client-1", "item-1")
