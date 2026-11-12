from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.controllers.content_aggregator_content_controller import router
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import register_error_handlers
from app.platform.security import limiter, setup_security
from app.platform.settings import get_settings
from app.services.content_aggregator._jwt import encode_access_token
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"
OTHER_TENANT = "69660fae7fccd4ee129e58af"
BODY = {
    "type": "story",
    "language": "en",
    "title": {"english": "My Story"},
    "theme": {"english": "Families"},
    "description": "hello",
    "audio_content": [{"audio_url": "https://x.example/a.mp3"}],
    "is_teacher_app": True,
}


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
async def client(db):
    limiter.reset()
    app = FastAPI()
    setup_security(app, get_settings())
    register_error_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


def _headers(
    client_id: str = "c-1",
    scopes: tuple[str, ...] = ("content:read", "content:write", "content:delete"),
    tenant_ids: tuple[str, ...] = (TENANT,),
    sent: str = TENANT,
) -> dict[str, str]:
    token, _ = encode_access_token(
        client_id=client_id,
        tenant_ids=list(tenant_ids),
        scopes=list(scopes),
        client_name=client_id,
        secret_key=get_settings().secret_key,
        expires_in="15m",
    )
    return {"Authorization": f"Bearer {token}", "x-tenant-ids": sent}


async def _create(client, db, client_id: str = "c-1") -> tuple[str, str]:
    response = await client.post("/v1/content", json=BODY, headers=_headers(client_id))
    job_id = response.json()["jobs"][TENANT]
    job = await db["content_jobs"].find_one({"_id": job_id})
    return job["content_id"], job_id


async def test_create_stores_in_content_aggregators_and_enqueues_one_job(client, db):
    response = await client.post("/v1/content", json=BODY, headers=_headers("hexis-adapter"))

    assert response.status_code == 200
    assert list(response.json()["jobs"]) == [TENANT]
    doc = await db["contentAggregators"].find_one({})
    assert doc["title"]["english"] == "My Story"
    assert doc["tenant_id"] == TENANT
    assert doc["is_processed"] is False
    job = await db["content_jobs"].find_one({})
    assert job["content_id"] == doc["content_id"]
    assert job["tenant_id"] == TENANT
    assert job["source"] == "hexis-adapter"
    assert await db["contentsV3"].count_documents({}) == 0


async def test_create_fans_out_one_item_and_job_per_tenant(client, db):
    headers = _headers(tenant_ids=(TENANT, OTHER_TENANT), sent=f"{TENANT},{OTHER_TENANT}")

    response = await client.post("/v1/content", json=BODY, headers=headers)

    assert set(response.json()["jobs"]) == {TENANT, OTHER_TENANT}
    assert await db["contentAggregators"].count_documents({}) == 2
    assert await db["content_jobs"].count_documents({}) == 2


@pytest.mark.parametrize(
    "override",
    [
        {"type": "video"},
        {"language": "xx"},
        {"audio_content": [{"audio_url": "https://x.example/a.wav"}]},
        {"unknown_field": 1},
    ],
)
async def test_create_rejects_invalid_body_at_the_request(client, db, override):
    response = await client.post("/v1/content", json={**BODY, **override}, headers=_headers())

    assert response.status_code == 422
    assert await db["contentAggregators"].count_documents({}) == 0


async def test_wrong_tenant_header_is_forbidden(client):
    response = await client.post("/v1/content", json=BODY, headers=_headers(sent=OTHER_TENANT))

    assert response.status_code == 403
    assert response.json()["code"] == "TENANT_NOT_ALLOWED"


@pytest.mark.parametrize("sent", [f"{TENANT},,", ",", f"{TENANT}, "])
async def test_empty_tenant_segments_are_forbidden(client, sent):
    response = await client.post("/v1/content", json=BODY, headers=_headers(sent=sent))

    assert response.status_code == 403
    assert response.json()["code"] == "TENANT_NOT_ALLOWED"


async def test_missing_scope_is_forbidden(client):
    response = await client.post("/v1/content", json=BODY, headers=_headers(scopes=("content:read",)))

    assert response.status_code == 403
    assert response.json()["code"] == "SCOPE_INSUFFICIENT"


async def test_eleventh_create_in_a_minute_is_limited(client):
    for _ in range(10):
        assert (await client.post("/v1/content", json=BODY, headers=_headers("c-limit"))).status_code == 200

    assert (await client.post("/v1/content", json=BODY, headers=_headers("c-limit"))).status_code == 429
    assert (await client.post("/v1/content", json=BODY, headers=_headers("c-other"))).status_code == 200


async def test_get_returns_item_and_404_for_unknown(client, db):
    content_id, _ = await _create(client, db)

    found = await client.get(f"/v1/content/{content_id}", headers=_headers())

    assert found.status_code == 200
    assert found.json()["title"]["english"] == "My Story"
    assert (await client.get("/v1/content/unknown", headers=_headers())).status_code == 404


async def test_get_hides_other_tenants_content(client, db):
    content_id, _ = await _create(client, db)
    headers = _headers(tenant_ids=(OTHER_TENANT,), sent=OTHER_TENANT)

    assert (await client.get(f"/v1/content/{content_id}", headers=headers)).status_code == 404


async def test_list_paginates_and_filters_by_ids(client, db):
    ids = [(await _create(client, db))[0] for _ in range(3)]
    for offset, content_id in enumerate(ids):
        await db["contentAggregators"].update_one({"content_id": content_id}, {"$set": {"creation_time": 100 - offset}})

    first = await client.get("/v1/content?limit=2", headers=_headers())
    assert [item["content_id"] for item in first.json()["data"]] == ids[:2]
    assert first.json()["pagination"]["has_more"] is True
    cursor = first.json()["pagination"]["next_cursor"]
    second = await client.get(f"/v1/content?limit=2&cursor={cursor}", headers=_headers())
    assert [item["content_id"] for item in second.json()["data"]] == ids[2:]
    assert second.json()["pagination"]["has_more"] is False

    picked = await client.get(f"/v1/content?ids={ids[0]}&ids={ids[2]}", headers=_headers())
    assert {item["content_id"] for item in picked.json()["data"]} == {ids[0], ids[2]}


async def test_list_cursor_moves_past_items_from_the_same_second(client, db):
    ids = [(await _create(client, db))[0] for _ in range(3)]
    await db["contentAggregators"].update_many({}, {"$set": {"creation_time": 100}})

    first = await client.get("/v1/content?limit=2", headers=_headers())
    cursor = first.json()["pagination"]["next_cursor"]
    second = await client.get(f"/v1/content?limit=2&cursor={cursor}", headers=_headers())

    seen = [item["content_id"] for item in first.json()["data"] + second.json()["data"]]
    assert sorted(seen) == sorted(ids)
    assert second.json()["pagination"]["has_more"] is False


async def test_list_filters_by_language_theme_and_type(client, db):
    await _create(client, db)
    await db["contentAggregators"].insert_one(
        {"tenant_id": TENANT, "content_id": "other", "type": "audio", "language": "kn", "title": {"english": "T"},
         "theme": {"english": "Other"}, "is_deleted": False, "creation_time": 1}
    )

    kn = await client.get("/v1/content?language=kn", headers=_headers())
    assert [item["content_id"] for item in kn.json()["data"]] == ["other"]
    theme = await client.get("/v1/content?theme=Families&exp_name=Story", headers=_headers())
    assert len(theme.json()["data"]) == 1
    assert (await client.get("/v1/content?cursor=garbage", headers=_headers())).status_code == 422


async def test_list_hides_other_tenants_and_deleted_items(client, db):
    content_id, _ = await _create(client, db)
    await _create(client, db)
    await db["contentAggregators"].update_one({"content_id": content_id}, {"$set": {"is_deleted": True}})
    other = _headers(tenant_ids=(OTHER_TENANT,), sent=OTHER_TENANT)

    assert len((await client.get("/v1/content", headers=_headers())).json()["data"]) == 1
    assert (await client.get("/v1/content", headers=other)).json()["data"] == []


async def test_patch_updates_fields_without_a_job(client, db):
    content_id, _ = await _create(client, db)

    response = await client.patch(f"/v1/content/{content_id}", json={"description": "updated"}, headers=_headers())

    assert response.status_code == 200
    assert response.json()["description"] == "updated"
    assert await db["content_jobs"].count_documents({}) == 1


async def test_patch_with_audio_uploaded_marks_unprocessed_and_enqueues_job(client, db):
    content_id, _ = await _create(client, db)
    audio = {"audio_content": [{"audio_url": "https://x.example/b.mp3"}]}

    response = await client.patch(f"/v1/content/{content_id}?isAudioUploaded=true", json=audio, headers=_headers())

    assert response.status_code == 200
    assert response.json()["job_id"]
    doc = await db["contentAggregators"].find_one({"content_id": content_id})
    assert doc["is_processed"] is False
    assert await db["content_jobs"].count_documents({"content_id": content_id}) == 2


async def test_patch_rejects_unknown_field_and_missing_item(client, db):
    content_id, _ = await _create(client, db)

    assert (await client.patch(f"/v1/content/{content_id}", json={"nope": 1}, headers=_headers())).status_code == 422
    assert (await client.patch(f"/v1/content/{'a' * 24}", json={"description": "x"}, headers=_headers())).status_code == 404


async def test_delete_soft_deletes_then_get_is_404(client, db):
    content_id, _ = await _create(client, db)

    deleted = await client.delete(f"/v1/content/{content_id}", headers=_headers())

    assert deleted.json() == {"matched": 1}
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
    other = _headers(tenant_ids=(OTHER_TENANT,), sent=OTHER_TENANT)

    assert (await client.get("/v1/content/job/nope", headers=_headers())).status_code == 404
    assert (await client.get(f"/v1/content/job/{job_id}", headers=other)).status_code == 404
