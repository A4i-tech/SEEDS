from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from bson import ObjectId
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.controllers.content_aggregator_content_controller import router
from app.platform.auth.dependencies import get_db
from app.platform.auth.partner import _limiter as partner_limiter
from app.platform.error_handling import register_error_handlers
from app.platform.security import limiter, setup_security
from app.platform.settings import get_settings
from app.platform.telemetry import configure_telemetry
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_request_repository import ContentRequestRepository
from app.services.content_aggregator._jwt import encode_access_token
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"
OTHER_TENANT = "69660fae7fccd4ee129e58af"
ABSENT = "69660fae7fccd4ee129e58aa"
BODY = {
    "type": "story",
    "language": "en",
    "title": {"english": "My Story"},
    "theme": {"english": "Families"},
    "description": "hello",
    "audio_content": [{"audio_url": "https://x.example/a.mp3"}],
    "is_teacher_app": True,
}


def _client_doc(client_id: str, tenant_ids: list[str], status: str = "active") -> dict:
    now = datetime.now(UTC)
    return {
        "client_id": client_id,
        "client_secret_hash": "h",
        "name": client_id,
        "tenant_ids": tenant_ids,
        "allowed_scopes": ["content:read", "content:write", "content:delete"],
        "status": status,
        "created_by": "admin",
        "created_at": now,
        "updated_at": now,
    }


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
async def client(db):
    limiter.reset()
    await ContentRequestRepository.ensure_indexes(db)
    partner_limiter.storage.reset()
    configure_telemetry(get_settings().model_copy(update={"applicationinsights_connection_string": ""}))
    app = FastAPI()
    setup_security(app, get_settings())
    register_error_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    await db["integrationClients"].insert_many(
        [
            _client_doc(client_id, tenant_ids)
            for client_id, tenant_ids in {
                "c-1": [TENANT],
                "c-2": [TENANT],
                "hexis-adapter": [TENANT],
                "c-other": [OTHER_TENANT],
                "c-both": [TENANT, OTHER_TENANT],
            }.items()
        ]
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


def _headers(
    client_id: str = "c-1",
    scopes: tuple[str, ...] = ("content:read", "content:write", "content:delete"),
    tenant_ids: tuple[str, ...] = (TENANT,),
    sent: str = TENANT,
    idempotency_key: str = "",
) -> dict[str, str]:
    token, _ = encode_access_token(
        client_id=client_id,
        tenant_ids=list(tenant_ids),
        scopes=list(scopes),
        client_name=client_id,
        secret_key=get_settings().secret_key,
        expires_in="15m",
    )
    return {
        "Authorization": f"Bearer {token}",
        "x-tenant-ids": sent,
        "Idempotency-Key": idempotency_key or str(uuid4()),
    }


async def _create_processed(client, db, client_id: str = "c-1") -> str:
    content_id, job_id = await _create(client, db, client_id)
    await db["content_jobs"].update_one({"_id": job_id}, {"$set": {"status": "completed"}})
    await db["contentsV3"].update_one({"_id": ObjectId(content_id)}, {"$set": {"is_processed": True}})
    return content_id


async def _create(client, db, client_id: str = "c-1") -> tuple[str, str]:
    response = await client.post("/v1/content", json=BODY, headers=_headers(client_id))
    job_id = response.json()["jobs"][TENANT]
    job = await db["content_jobs"].find_one({"_id": job_id})
    return job["content_id"], job_id


async def test_create_stores_in_contents_v3_and_enqueues_one_job(client, db):
    response = await client.post("/v1/content", json=BODY, headers=_headers("hexis-adapter"))

    assert response.status_code == 200
    assert list(response.json()["jobs"]) == [TENANT]
    doc = await db["contentsV3"].find_one({})
    assert doc["title"]["english"] == "My Story"
    assert doc["tenant_id"] == ObjectId(TENANT)
    assert doc["school_id"] is None
    assert doc["created_by"] == (await db["integrationClients"].find_one({"client_id": "hexis-adapter"}))["_id"]
    assert doc["is_processed"] is False
    job = await db["content_jobs"].find_one({})
    assert job["content_id"] == str(doc["_id"])
    assert await db["contentAggregators"].count_documents({}) == 0


async def test_create_fans_out_one_item_and_job_per_tenant(client, db):
    headers = _headers("c-both", tenant_ids=(TENANT, OTHER_TENANT), sent=f"{TENANT},{OTHER_TENANT}")

    response = await client.post("/v1/content", json=BODY, headers=headers)

    assert set(response.json()["jobs"]) == {TENANT, OTHER_TENANT}
    assert await db["contentsV3"].count_documents({}) == 2
    assert await db["content_jobs"].count_documents({}) == 2


@pytest.mark.parametrize(
    "override",
    [
        {"type": "video"},
        {"audio_content": [{"audio_url": "https://x.example/a.wav"}]},
        {"audio_content": [{"audio_url": "http://x.example/a.mp3"}]},
        {"unknown_field": 1},
    ],
)
async def test_create_rejects_invalid_body_at_the_request(client, db, override):
    response = await client.post("/v1/content", json={**BODY, **override}, headers=_headers())

    assert response.status_code == 422
    assert await db["contentsV3"].count_documents({}) == 0


@pytest.mark.parametrize("sent", [f"{TENANT},,", ",", f"{TENANT}, "])
async def test_empty_tenant_segments_are_forbidden(client, sent):
    response = await client.post("/v1/content", json=BODY, headers=_headers(sent=sent))

    assert response.status_code == 403
    assert response.json()["code"] == "TENANT_NOT_ALLOWED"


async def test_missing_scope_is_forbidden(client):
    response = await client.post("/v1/content", json=BODY, headers=_headers(scopes=("content:read",)))

    assert response.status_code == 403
    assert response.json()["code"] == "SCOPE_INSUFFICIENT"


async def test_get_returns_item_and_404_for_unknown(client, db):
    content_id, _ = await _create(client, db)

    found = await client.get(f"/v1/content/{content_id}", headers=_headers())

    assert found.status_code == 200
    assert found.json()["title"]["english"] == "My Story"
    assert (await client.get(f"/v1/content/{ABSENT}", headers=_headers())).status_code == 404


async def test_get_hides_other_tenants_content(client, db):
    content_id, _ = await _create(client, db)
    headers = _headers("c-other", tenant_ids=(OTHER_TENANT,), sent=OTHER_TENANT)

    assert (await client.get(f"/v1/content/{content_id}", headers=headers)).status_code == 404


async def test_list_paginates_and_filters_by_ids(client, db):
    ids = [(await _create(client, db))[0] for _ in range(3)]
    for offset, content_id in enumerate(ids):
        await db["contentsV3"].update_one({"_id": ObjectId(content_id)}, {"$set": {"creation_time": 100 - offset}})

    first = await client.get("/v1/content?limit=2", headers=_headers())
    assert [item["_id"] for item in first.json()["data"]] == ids[:2]
    assert first.json()["pagination"]["has_more"] is True
    cursor = first.json()["pagination"]["next_cursor"]
    second = await client.get(f"/v1/content?limit=2&cursor={cursor}", headers=_headers())
    assert [item["_id"] for item in second.json()["data"]] == ids[2:]
    assert second.json()["pagination"]["has_more"] is False

    picked = await client.get(f"/v1/content?ids={ids[0]}&ids={ids[2]}", headers=_headers())
    assert {item["_id"] for item in picked.json()["data"]} == {ids[0], ids[2]}


async def test_list_cursor_moves_past_items_from_the_same_second(client, db):
    ids = [(await _create(client, db))[0] for _ in range(3)]
    await db["contentsV3"].update_many({}, {"$set": {"creation_time": 100}})

    first = await client.get("/v1/content?limit=2", headers=_headers())
    cursor = first.json()["pagination"]["next_cursor"]
    second = await client.get(f"/v1/content?limit=2&cursor={cursor}", headers=_headers())

    seen = [item["_id"] for item in first.json()["data"] + second.json()["data"]]
    assert sorted(seen) == sorted(ids)
    assert second.json()["pagination"]["has_more"] is False


async def test_list_filters_by_language_theme_and_type(client, db):
    await _create(client, db)
    other_id = (
        await db["contentsV3"].insert_one(
            {"tenant_id": ObjectId(TENANT), "type": "audio", "language": "kn", "title": {"english": "T"},
             "theme": {"english": "Other"}, "is_deleted": False, "creation_time": 1}
        )
    ).inserted_id

    kn = await client.get("/v1/content?language=kn", headers=_headers())
    assert [item["_id"] for item in kn.json()["data"]] == [str(other_id)]
    theme = await client.get("/v1/content?theme=Families&exp_name=Story", headers=_headers())
    assert len(theme.json()["data"]) == 1


async def test_list_hides_other_tenants_and_deleted_items(client, db):
    content_id, _ = await _create(client, db)
    await _create(client, db)
    await db["contentsV3"].update_one({"_id": ObjectId(content_id)}, {"$set": {"is_deleted": True}})
    other = _headers("c-other", tenant_ids=(OTHER_TENANT,), sent=OTHER_TENANT)

    assert len((await client.get("/v1/content", headers=_headers())).json()["data"]) == 1
    assert (await client.get("/v1/content", headers=other)).json()["data"] == []


async def test_patch_without_audio_updates_details_and_queues_no_job(client, db):
    content_id = await _create_processed(client, db)

    response = await client.patch(f"/v1/content/{content_id}", json={"description": "updated"}, headers=_headers())

    assert response.status_code == 200
    assert response.json()["description"] == "updated"
    assert response.json()["is_processed"] is True
    assert await db["content_jobs"].count_documents({}) == 1


async def test_patch_with_audio_marks_unprocessed_and_queues_a_job(client, db):
    content_id = await _create_processed(client, db)
    audio = {"audio_content": [{"audio_url": "https://x.example/b.mp3"}]}

    response = await client.patch(f"/v1/content/{content_id}", json=audio, headers=_headers())

    assert response.status_code == 200
    assert response.json()["job_id"]
    doc = await db["contentsV3"].find_one({"_id": ObjectId(content_id)})
    assert doc["is_processed"] is False
    assert await db["content_jobs"].count_documents({"content_id": content_id}) == 2


@pytest.mark.parametrize("status", ["pending", "claimed", "running"])
async def test_patch_while_a_job_is_open_is_409_and_changes_nothing(client, db, status):
    content_id, job_id = await _create(client, db)
    await db["content_jobs"].update_one({"_id": job_id}, {"$set": {"status": status}})

    response = await client.patch(f"/v1/content/{content_id}", json={"description": "x"}, headers=_headers())

    assert response.status_code == 409
    assert response.json()["code"] == "JOB_IN_PROGRESS"
    assert (await db["contentsV3"].find_one({"_id": ObjectId(content_id)}))["description"] == "hello"


async def test_patch_after_a_failed_job_is_allowed(client, db):
    content_id, job_id = await _create(client, db)
    await db["content_jobs"].update_one({"_id": job_id}, {"$set": {"status": "failed"}})

    response = await client.patch(f"/v1/content/{content_id}", json={"description": "x"}, headers=_headers())

    assert response.status_code == 200


async def test_another_partner_patching_during_an_open_job_gets_404_not_409(client, db):
    content_id, _ = await _create(client, db, "c-1")

    response = await client.patch(f"/v1/content/{content_id}", json={"description": "x"}, headers=_headers("c-2"))

    assert response.status_code == 404


async def test_patch_rejects_unknown_field_and_missing_item(client, db):
    content_id = await _create_processed(client, db)

    assert (await client.patch(f"/v1/content/{content_id}", json={"nope": 1}, headers=_headers())).status_code == 422
    insecure = {"audio_content": [{"audio_url": "http://x.example/a.mp3"}]}
    assert (await client.patch(f"/v1/content/{content_id}", json=insecure, headers=_headers())).status_code == 422
    assert (await client.patch(f"/v1/content/{'a' * 24}", json={"description": "x"}, headers=_headers())).status_code == 404


async def test_delete_soft_deletes_then_get_is_404(client, db):
    content_id, _ = await _create(client, db)

    deleted = await client.delete(f"/v1/content/{content_id}", headers=_headers())

    assert deleted.json() == {"acknowledged": True, "matched_count": 1, "modified_count": 1}
    assert (await client.get(f"/v1/content/{content_id}", headers=_headers())).status_code == 404
    assert (await client.delete(f"/v1/content/{content_id}", headers=_headers())).status_code == 404


async def test_job_status_follows_the_job(client, db):
    content_id, job_id = await _create(client, db)

    pending = await client.get(f"/v1/content/job/{job_id}", headers=_headers())
    assert pending.json()["status"] == "pending"
    assert pending.json()["content_id"] == content_id

    await db["content_jobs"].update_one({"_id": job_id}, {"$set": {"status": "failed", "reason": "boom"}})
    failed = await client.get(f"/v1/content/job/{job_id}", headers=_headers())
    assert failed.json()["status"] == "failed"
    assert failed.json()["reason"] == "boom"


async def test_job_status_unknown_or_other_tenant_is_404(client, db):
    _, job_id = await _create(client, db)
    other = _headers("c-other", tenant_ids=(OTHER_TENANT,), sent=OTHER_TENANT)

    assert (await client.get(f"/v1/content/job/{ABSENT}", headers=_headers())).status_code == 404
    assert (await client.get(f"/v1/content/job/{job_id}", headers=other)).status_code == 404


async def _tenant_side_story(db, created_by: ObjectId) -> str:
    inserted = await db["contentsV3"].insert_one(
        {
            "tenant_id": ObjectId(TENANT),
            "school_id": ObjectId(),
            "created_by": created_by,
            "type": "story",
            "language": "en",
            "title": {"english": "Teacher Story"},
            "theme": {"english": "T"},
            "description": "teacher wrote this",
            "is_deleted": False,
            "creation_time": 1,
        }
    )
    return str(inserted.inserted_id)


async def test_partner_reads_tenant_side_content_but_cannot_change_it(client, db):
    teacher_story = await _tenant_side_story(db, ObjectId())

    assert (await client.get(f"/v1/content/{teacher_story}", headers=_headers())).status_code == 200
    patched = await client.patch(f"/v1/content/{teacher_story}", json={"description": "x"}, headers=_headers())
    deleted = await client.delete(f"/v1/content/{teacher_story}", headers=_headers())

    assert patched.status_code == 404
    assert deleted.status_code == 404
    stored = await db["contentsV3"].find_one({"_id": ObjectId(teacher_story)})
    assert stored["description"] == "teacher wrote this"
    assert stored["is_deleted"] is False


async def test_partner_cannot_change_another_partners_content(client, db):
    content_id, _ = await _create(client, db, "c-1")
    other = _headers("c-2")

    assert (await client.get(f"/v1/content/{content_id}", headers=other)).status_code == 200
    assert (await client.patch(f"/v1/content/{content_id}", json={"description": "x"}, headers=other)).status_code == 404
    assert (await client.delete(f"/v1/content/{content_id}", headers=other)).status_code == 404
    assert (await client.delete(f"/v1/content/{content_id}", headers=_headers("c-1"))).status_code == 200


async def test_job_status_of_another_partner_is_404(client, db):
    _, job_id = await _create(client, db, "c-1")

    assert (await client.get(f"/v1/content/job/{job_id}", headers=_headers("c-2"))).status_code == 404


async def test_token_of_an_unknown_client_is_unauthorized(client):
    response = await client.post("/v1/content", json=BODY, headers=_headers("never-registered"))

    assert response.status_code == 401


async def test_revoked_client_is_forbidden_even_with_a_valid_token(client, db):
    await db["integrationClients"].update_one({"client_id": "c-1"}, {"$set": {"status": "revoked"}})

    response = await client.get("/v1/content", headers=_headers("c-1"))

    assert response.status_code == 403
    assert response.json()["code"] == "TENANT_NOT_ALLOWED"


async def test_tenant_removed_from_the_client_is_forbidden_even_if_the_token_lists_it(client, db):
    await db["integrationClients"].update_one({"client_id": "c-1"}, {"$set": {"tenant_ids": [OTHER_TENANT]}})

    response = await client.get("/v1/content", headers=_headers("c-1"))

    assert response.status_code == 403
    assert response.json()["code"] == "TENANT_NOT_ALLOWED"


async def test_removed_scope_in_the_client_record_is_forbidden_even_if_the_token_has_it(client, db):
    content_id, _ = await _create(client, db)
    await db["integrationClients"].update_one({"client_id": "c-1"}, {"$set": {"allowed_scopes": ["content:read"]}})

    created = await client.post("/v1/content", json=BODY, headers=_headers("c-1"))
    deleted = await client.delete(f"/v1/content/{content_id}", headers=_headers("c-1"))
    listed = await client.get("/v1/content", headers=_headers("c-1"))

    assert created.status_code == 403
    assert created.json()["code"] == "SCOPE_INSUFFICIENT"
    assert deleted.status_code == 403
    assert listed.status_code == 200


async def test_tenant_in_the_record_but_not_in_the_token_is_forbidden(client, db):
    await db["integrationClients"].update_one({"client_id": "c-1"}, {"$set": {"tenant_ids": [TENANT, OTHER_TENANT]}})

    response = await client.get("/v1/content", headers=_headers("c-1", sent=OTHER_TENANT))

    assert response.status_code == 403
    assert response.json()["code"] == "TENANT_NOT_ALLOWED"


async def test_job_status_of_a_tenant_side_job_is_404(client, db):
    teacher_story = await _tenant_side_story(db, ObjectId())
    job_id = await ContentJobRepository(db).create(teacher_story)

    assert (await client.get(f"/v1/content/job/{job_id}", headers=_headers())).status_code == 404


async def test_job_status_of_a_job_without_contents_v3_item_is_404(client, db):
    job_id = await ContentJobRepository(db).create(str(ObjectId()))

    assert (await client.get(f"/v1/content/job/{job_id}", headers=_headers())).status_code == 404


QUIZ = {
    "type": "quiz",
    "language": "en",
    "title": {"english": "Animals"},
    "theme": {"english": "Nature"},
    "questions": [
        {
            "question": {"id": "q1", "text": "Which one barks?"},
            "options": [{"id": "a", "text": "Dog"}, {"id": "b", "text": "Cat"}],
            "correct_option_id": "a",
        }
    ],
}


@pytest.mark.parametrize("content_type", ["story", "audio", "song", "poem", "snippet"])
async def test_create_accepts_every_audio_type(client, db, content_type):
    response = await client.post("/v1/content", json={**BODY, "type": content_type}, headers=_headers())

    assert response.status_code == 200
    assert (await db["contentsV3"].find_one({}))["type"] == content_type


async def test_create_quiz_stores_in_quiz_data_with_the_owner_and_a_completed_job(client, db):
    response = await client.post("/v1/content", json=QUIZ, headers=_headers("c-1"))

    assert response.status_code == 200
    quiz = await db["quizData"].find_one({})
    owner = (await db["integrationClients"].find_one({"client_id": "c-1"}))["_id"]
    assert quiz["tenant_id"] == ObjectId(TENANT)
    assert quiz["created_by"] == owner
    assert quiz["positive_marks"] == 1.0
    assert quiz["questions"][0]["correct_option_id"] == "a"
    assert await db["contentsV3"].count_documents({}) == 0
    job_id = response.json()["jobs"][TENANT]
    status = await client.get(f"/v1/content/job/{job_id}", headers=_headers("c-1"))
    assert status.json()["status"] == "completed"
    assert status.json()["content_id"] == str(quiz["_id"])
    assert (await client.get(f"/v1/content/job/{job_id}", headers=_headers("c-2"))).status_code == 404


async def test_create_quiz_fans_out_one_quiz_per_tenant(client, db):
    headers = _headers("c-both", tenant_ids=(TENANT, OTHER_TENANT), sent=f"{TENANT},{OTHER_TENANT}")

    response = await client.post("/v1/content", json=QUIZ, headers=headers)

    assert set(response.json()["jobs"]) == {TENANT, OTHER_TENANT}
    assert await db["quizData"].count_documents({}) == 2


async def _create_quiz(client, client_id: str = "c-1") -> str:
    response = await client.post("/v1/content", json=QUIZ, headers=_headers(client_id))
    job = await client.get(f"/v1/content/job/{response.json()['jobs'][TENANT]}", headers=_headers(client_id))
    return job.json()["content_id"]


async def test_get_returns_the_quiz_with_its_questions(client):
    quiz_id = await _create_quiz(client)

    response = await client.get(f"/v1/content/{quiz_id}", headers=_headers("c-2"))

    assert response.status_code == 200
    assert response.json()["type"] == "quiz"
    assert response.json()["questions"][0]["correct_option_id"] == "a"


async def test_list_returns_quizzes_only_for_exp_name_quiz(client):
    await _create_quiz(client)
    await client.post("/v1/content", json=BODY, headers=_headers())

    quizzes = await client.get("/v1/content", params={"exp_name": "quiz"}, headers=_headers())
    stories = await client.get("/v1/content", headers=_headers())

    assert [item["type"] for item in quizzes.json()["data"]] == ["quiz"]
    assert [item["type"] for item in stories.json()["data"]] == ["story"]


async def test_patch_updates_the_owners_quiz(client, db):
    quiz_id = await _create_quiz(client)

    response = await client.patch(
        f"/v1/content/{quiz_id}", json={"positive_marks": 5, "description": "ignored"}, headers=_headers()
    )

    assert response.status_code == 200
    assert response.json()["positive_marks"] == 5
    stored = await db["quizData"].find_one({})
    assert stored["positive_marks"] == 5
    assert "description" not in stored


async def test_partner_cannot_change_another_partners_quiz(client, db):
    quiz_id = await _create_quiz(client, "c-1")
    other = _headers("c-2")

    assert (await client.patch(f"/v1/content/{quiz_id}", json={"positive_marks": 9}, headers=other)).status_code == 404
    assert (await client.delete(f"/v1/content/{quiz_id}", headers=other)).status_code == 404
    assert (await db["quizData"].find_one({}))["positive_marks"] == 1.0


async def test_partner_cannot_change_a_tenant_side_quiz(client, db):
    inserted = await db["quizData"].insert_one(
        {"tenant_id": ObjectId(TENANT), "created_by": ObjectId(), "is_deleted": False, "language": "en", "questions": []}
    )
    quiz_id = str(inserted.inserted_id)

    assert (await client.get(f"/v1/content/{quiz_id}", headers=_headers())).status_code == 200
    assert (await client.patch(f"/v1/content/{quiz_id}", json={"positive_marks": 9}, headers=_headers())).status_code == 404
    assert (await client.delete(f"/v1/content/{quiz_id}", headers=_headers())).status_code == 404


async def test_delete_soft_deletes_the_owners_quiz(client):
    quiz_id = await _create_quiz(client)

    deleted = await client.delete(f"/v1/content/{quiz_id}", headers=_headers())

    assert deleted.json() == {"acknowledged": True, "matched_count": 1, "modified_count": 1}
    assert (await client.get(f"/v1/content/{quiz_id}", headers=_headers())).status_code == 404


async def test_repeated_post_with_the_same_key_replays_the_first_response(client, db):
    headers = _headers(idempotency_key="k-1")

    first = await client.post("/v1/content", json=BODY, headers=headers)
    second = await client.post("/v1/content", json=BODY, headers=headers)

    assert second.status_code == 200
    assert second.json() == first.json()
    assert await db["contentsV3"].count_documents({}) == 1
    assert await db["content_jobs"].count_documents({}) == 1


async def test_same_key_with_a_different_payload_is_409_and_creates_nothing(client, db):
    headers = _headers(idempotency_key="k-1")
    await client.post("/v1/content", json=BODY, headers=headers)

    response = await client.post("/v1/content", json={**BODY, "description": "changed"}, headers=headers)

    assert response.status_code == 409
    assert response.json()["code"] == "IDEMPOTENCY_CONFLICT"
    assert await db["contentsV3"].count_documents({}) == 1


async def test_same_key_is_independent_per_client(client, db):
    await client.post("/v1/content", json=BODY, headers=_headers("c-1", idempotency_key="k-1"))
    await client.post("/v1/content", json=BODY, headers=_headers("c-2", idempotency_key="k-1"))

    assert await db["contentsV3"].count_documents({}) == 2


async def test_retry_after_a_partial_fan_out_creates_only_the_missing_tenant(client, db):
    only_first = _headers("c-both", tenant_ids=(TENANT, OTHER_TENANT), idempotency_key="k-1")
    both = _headers("c-both", tenant_ids=(TENANT, OTHER_TENANT), sent=f"{TENANT},{OTHER_TENANT}", idempotency_key="k-1")
    first = await client.post("/v1/content", json=BODY, headers=only_first)

    retried = await client.post("/v1/content", json=BODY, headers=both)

    assert retried.json()["jobs"][TENANT] == first.json()["jobs"][TENANT]
    assert set(retried.json()["jobs"]) == {TENANT, OTHER_TENANT}
    assert await db["contentsV3"].count_documents({}) == 2


async def test_concurrent_identical_posts_create_one_item(client, db):
    headers = _headers(idempotency_key="k-1")

    responses = await asyncio.gather(*[client.post("/v1/content", json=BODY, headers=headers) for _ in range(2)])

    assert {r.status_code for r in responses} <= {200, 409}
    assert await db["contentsV3"].count_documents({}) == 1
    assert await db["content_jobs"].count_documents({}) == 1


async def test_delete_cancels_the_pending_job_so_the_consumer_never_claims_it(client, db):
    content_id, job_id = await _create(client, db)

    deleted = await client.delete(f"/v1/content/{content_id}", headers=_headers())

    assert deleted.status_code == 200
    status = await client.get(f"/v1/content/job/{job_id}", headers=_headers())
    assert status.json()["status"] == "cancelled"
    assert await ContentJobRepository(db).claim_next_pending() is None


async def test_delete_leaves_completed_jobs_as_they_were(client, db):
    content_id = await _create_processed(client, db)

    await client.delete(f"/v1/content/{content_id}", headers=_headers())

    assert (await db["content_jobs"].find_one({"content_id": content_id}))["status"] == "completed"


async def test_delete_by_another_partner_does_not_cancel_the_job(client, db):
    content_id, job_id = await _create(client, db, "c-1")

    response = await client.delete(f"/v1/content/{content_id}", headers=_headers("c-2"))

    assert response.status_code == 404
    assert (await db["content_jobs"].find_one({"_id": job_id}))["status"] == "pending"


async def test_unsupported_language_is_400_with_the_valid_codes(client, db):
    response = await client.post("/v1/content", json={**BODY, "language": "xx"}, headers=_headers())

    assert response.status_code == 400
    assert response.json()["code"] == "UNSUPPORTED_LANGUAGE"
    assert "kn" in response.json()["details"]["valid"]
    assert await db["contentsV3"].count_documents({}) == 0


async def test_client_over_its_limit_gets_429_with_retry_after(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "content_aggregator_client_rate_limit", "2/minute")
    headers = _headers("c-1")

    statuses = [(await client.get("/v1/content", headers=headers)).status_code for _ in range(2)]
    limited = await client.get("/v1/content", headers=headers)

    assert statuses == [200, 200]
    assert limited.status_code == 429
    assert limited.json()["code"] == "RATE_LIMIT_EXCEEDED"
    assert 1 <= int(limited.headers["Retry-After"]) <= 60
    assert (await client.get("/v1/content", headers=_headers("c-2"))).status_code == 200


async def test_global_limit_applies_across_clients(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "content_aggregator_global_rate_limit", "3/minute")

    statuses = [
        (await client.get("/v1/content", headers=_headers(client_id))).status_code
        for client_id in ("c-1", "c-2", "c-1", "c-2")
    ]

    assert statuses == [200, 200, 200, 429]


@pytest.mark.parametrize("cursor", ["abc", "1_zzz", "5_", "_" + "a" * 24, "-5_" + "a" * 24, "x_" + "a" * 24])
async def test_list_rejects_a_malformed_cursor_with_422(client, cursor):
    response = await client.get("/v1/content", params={"cursor": cursor}, headers=_headers())

    assert response.status_code == 422
