from __future__ import annotations

import pytest
from bson import ObjectId

from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreate,
    PartnerContentUpdate,
)
from app.platform.error_handling import AppError, NotFoundError
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository
from app.services.content_aggregator.content import PartnerContentService
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"
CLIENT = "client-1"


@pytest.fixture
def setup():
    client = AsyncMongoMockClient()
    db = client["test_seeds"]
    service = PartnerContentService(
        ContentAggregatorRepository(db), ContentRepository(db), ContentJobRepository(db)
    )
    return db, service


def _create(content_id="c1", **overrides) -> PartnerContentCreate:
    body = {
        "type": "story",
        "language": "en",
        "title": {"english": "My Story"},
        "description": "desc",
        "audio_content": [{"audio_url": "https://x.example/a.mp3"}],
        "is_teacher_app": True,
    } | overrides
    return PartnerContentCreate(**body)


async def test_create_item_rejects_unsupported_language(setup):
    _, service = setup
    with pytest.raises(AppError) as exc:
        await service.create_item(TENANT, CLIENT, "c1", _create(language="xx"))
    assert exc.value.code == "UNSUPPORTED_LANGUAGE"


async def test_create_item_stores_contentsv3_shaped_doc_in_content_aggregators(setup):
    db, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create())

    doc = await db["contentAggregators"].find_one({"tenant_id": TENANT, "content_id": "c1"})
    assert doc is not None
    assert doc["created_by"] == CLIENT
    assert doc["type"] == "story"
    assert doc["language"] == "en"
    assert doc["title"]["english"] == "My Story"
    assert doc["audio_content"][0]["audio_url"] == "https://x.example/a.mp3"
    assert doc["is_teacher_app"] is True
    assert doc["is_deleted"] is False
    assert isinstance(doc["creation_time"], int)


async def test_create_item_is_idempotent_on_same_content_id(setup):
    db, service = setup
    _, first_created = await service.create_item(TENANT, CLIENT, "c1", _create(description="v1"))
    doc, second_created = await service.create_item(TENANT, CLIENT, "c1", _create(description="v2"))

    assert (first_created, second_created) == (True, False)
    assert doc["description"] == "v1"
    assert await db["contentAggregators"].count_documents({"tenant_id": TENANT, "content_id": "c1"}) == 1


async def test_get_item_reads_partner_doc(setup):
    _, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create())
    assert (await service.get_item(TENANT, "c1"))["content_id"] == "c1"


async def test_get_item_falls_back_to_contents_v3(setup):
    db, service = setup
    await db["contentsV3"].insert_one({"tenant_id": ObjectId(TENANT), "content_id": "own-1", "type": "song", "language": "kn"})
    doc = await service.get_item(TENANT, "own-1")
    assert doc["type"] == "song"


async def test_get_item_not_found_raises(setup):
    _, service = setup
    with pytest.raises(NotFoundError):
        await service.get_item(TENANT, "missing")


async def test_update_item_updates_fields(setup):
    _, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create())
    doc = await service.update_item(TENANT, "c1", PartnerContentUpdate(description="updated"), is_audio_uploaded=False)
    assert doc["description"] == "updated"
    assert (await service.get_item(TENANT, "c1"))["description"] == "updated"


async def test_update_item_sets_is_processed_false_when_audio_uploaded(setup):
    _, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create())
    doc = await service.update_item(TENANT, "c1", PartnerContentUpdate(), is_audio_uploaded=True)
    assert doc["is_processed"] is False


async def test_update_item_rejects_unsupported_language(setup):
    _, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create())
    with pytest.raises(AppError) as exc:
        await service.update_item(TENANT, "c1", PartnerContentUpdate(language="xx"), is_audio_uploaded=False)
    assert exc.value.code == "UNSUPPORTED_LANGUAGE"


async def test_update_item_not_found_raises(setup):
    _, service = setup
    with pytest.raises(NotFoundError):
        await service.update_item(TENANT, "missing", PartnerContentUpdate(description="x"), is_audio_uploaded=False)


async def test_delete_item_soft_deletes(setup):
    _, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create())
    acknowledged, matched, modified = await service.delete_item(TENANT, "c1")
    assert (acknowledged, matched, modified) == (True, 1, 1)
    with pytest.raises(NotFoundError):
        await service.get_item(TENANT, "c1")


async def test_delete_item_not_found_raises(setup):
    _, service = setup
    with pytest.raises(NotFoundError):
        await service.delete_item(TENANT, "missing")


async def test_list_items_merges_both_and_prefers_partner(setup):
    db, service = setup
    await db["contentsV3"].insert_many([
        {"tenant_id": ObjectId(TENANT), "content_id": "own-1", "type": "song", "language": "en", "creation_time": 3},
        {"tenant_id": ObjectId(TENANT), "content_id": "c1", "type": "song", "language": "en", "creation_time": 2},
    ])
    await service._partner_repo.upsert_partner_content(
        TENANT, {"tenant_id": TENANT, "content_id": "c1", "type": "story", "language": "en", "creation_time": 10, "is_deleted": False}
    )
    await service._partner_repo.upsert_partner_content(
        TENANT, {"tenant_id": TENANT, "content_id": "c2", "type": "poem", "language": "en", "creation_time": 1, "is_deleted": False}
    )

    items, next_cursor, has_more = await service.list_items(TENANT)
    assert [d["content_id"] for d in items] == ["c1", "own-1", "c2"]
    assert items[0]["type"] == "story"  # partner doc wins over the same-key contentsV3 doc
    assert has_more is False
    assert next_cursor is None


async def test_list_items_paginates(setup):
    _, service = setup
    for i in range(3):
        await service._partner_repo.upsert_partner_content(
            TENANT,
            {"tenant_id": TENANT, "content_id": f"c{i}", "type": "story", "language": "en", "creation_time": 10 - i, "is_deleted": False},
        )

    items, next_cursor, has_more = await service.list_items(TENANT, limit=2)
    assert [d["content_id"] for d in items] == ["c0", "c1"]
    assert has_more is True
    assert next_cursor == "9_c1"

    items2, _, has_more2 = await service.list_items(TENANT, limit=2, cursor=next_cursor)
    assert [d["content_id"] for d in items2] == ["c2"]
    assert has_more2 is False



async def _status_with_job(setup, **job_fields):
    db, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create())
    job_id = await service.enqueue_content_job(TENANT, "c1")
    await db["content_jobs"].update_one({"_id": job_id}, {"$set": job_fields})
    return await service.get_status(TENANT, "c1")


async def test_status_pending_job_returns_pending(setup):
    assert (await _status_with_job(setup)).status == "pending"


async def test_status_claimed_job_returns_pending(setup):
    assert (await _status_with_job(setup, status="claimed")).status == "pending"


async def test_status_running_job_returns_processing(setup):
    assert (await _status_with_job(setup, status="running")).status == "processing"


async def test_status_completed_job_returns_completed(setup):
    assert (await _status_with_job(setup, status="completed")).status == "completed"


async def test_status_failed_job_returns_failed_with_error(setup):
    result = await _status_with_job(setup, status="failed", reason="tts down")
    assert (result.status, result.error) == ("failed", "tts down")


async def test_status_unknown_content_raises_not_found(setup):
    _, service = setup
    with pytest.raises(NotFoundError):
        await service.get_status(TENANT, "missing")


async def test_status_other_tenants_job_not_visible(setup):
    db, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create())
    await service.enqueue_content_job("other-tenant", "c1")
    with pytest.raises(NotFoundError):
        await service.get_status(TENANT, "c1")


@pytest.mark.parametrize("status", ["pending", "claimed", "running"])
async def test_update_in_flight_item_raises_409_and_leaves_doc_unchanged(setup, status):
    db, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create(description="v1"))
    job_id = await service.enqueue_content_job(TENANT, "c1")
    await db["content_jobs"].update_one({"_id": job_id}, {"$set": {"status": status}})
    with pytest.raises(AppError) as exc:
        await service.update_item(TENANT, "c1", PartnerContentUpdate(description="v2"), is_audio_uploaded=False)
    assert (exc.value.code, exc.value.status_code) == ("CONTENT_PROCESSING", 409)
    assert (await service.get_item(TENANT, "c1"))["description"] == "v1"


@pytest.mark.parametrize("status", ["completed", "failed"])
async def test_update_finished_item_is_allowed(setup, status):
    db, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create())
    job_id = await service.enqueue_content_job(TENANT, "c1")
    await db["content_jobs"].update_one({"_id": job_id}, {"$set": {"status": status}})
    doc = await service.update_item(TENANT, "c1", PartnerContentUpdate(description="v2"), is_audio_uploaded=False)
    assert doc["description"] == "v2"


async def test_update_without_audio_flag_keeps_is_processed(setup):
    db, service = setup
    await service.create_item(TENANT, CLIENT, "c1", _create())
    await db["contentAggregators"].update_one({"content_id": "c1"}, {"$set": {"is_processed": True}})
    doc = await service.update_item(TENANT, "c1", PartnerContentUpdate(description="v2"), is_audio_uploaded=False)
    assert doc["is_processed"] is True
