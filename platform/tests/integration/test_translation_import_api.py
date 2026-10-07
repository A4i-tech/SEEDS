from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.requests.translation_requests import MAX_IMPORT_ROWS
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.translation_repository import TranslationRepository
from app.repositories.website_repository import WebsiteRepository
from app.services.sdk_rolling_hash import sdk_rolling_hash
from tests.support.mongomock_async import AsyncMongoMockClient

pytestmark = pytest.mark.asyncio

URL = "/translations/import?site_id=site1"
LANGS = [{"code": "kn", "enabled": True}]


@pytest.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test"]
    yield db
    await client.close()


@pytest.fixture
async def client(mock_db):
    async def _override_db():
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _headers(role: str = "tenant", user_id: str = "t1") -> dict[str, str]:
    token = create_access_token({"sub": user_id, "role": role, "tenant_id": "t1"})
    return {"Authorization": f"Bearer {token}"}


def _body(**overrides):
    body = {
        "lang": "kn",
        "overwrite_blank": False,
        "state": "pending",
        "rows": [{"route": "/", "key": sdk_rolling_hash("Hello World"), "source": "Hello World", "text": "ಹಲೋ"}],
    }
    return {**body, **overrides}


async def _seed_site(mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)
    await WebsiteRepository(mock_db).create("t1", None, "acme.com", "site1", languages=LANGS)
    repo = TranslationRepository(mock_db)
    await repo.upsert_source("site1", "/", sdk_rolling_hash("Hello World"), "en", "Hello World")
    return repo


async def test_import_requires_auth(client):
    assert (await client.post(URL, json=_body())).status_code == 401


async def test_import_forbids_school_admin_and_teacher(client):
    assert (await client.post(URL, json=_body(), headers=_headers("school_admin"))).status_code == 403
    assert (await client.post(URL, json=_body(), headers=_headers("teacher"))).status_code == 403


async def test_import_writes_rows_and_returns_per_row_results(client, mock_db):
    repo = await _seed_site(mock_db)
    body = _body()
    body["rows"].append({"route": "/", "key": "tbad", "source": "Nope", "text": "x"})

    resp = await client.post(URL, json=body, headers=_headers())

    assert resp.status_code == 200
    assert resp.json() == {
        "updated": 1,
        "created": 0,
        "unchanged": 0,
        "skipped_blank": 0,
        "failed": 1,
        "errors": [{"row": 2, "route": "/", "key": "tbad", "reason": "key_mismatch"}],
    }
    doc = (await repo.find_by_route("site1", "/"))[0]
    assert doc["translations"]["kn"]["text"] == "ಹಲೋ"


async def test_import_denies_a_different_tenants_site_without_writing(client, mock_db):
    repo = await _seed_site(mock_db)

    resp = await client.post(URL, json=_body(), headers=_headers(user_id="t2"))

    assert resp.status_code == 404
    assert (await repo.find_by_route("site1", "/"))[0]["translations"] == {}


async def test_import_rejects_a_language_not_enabled_on_the_site(client, mock_db):
    await _seed_site(mock_db)

    resp = await client.post(URL, json=_body(lang="te"), headers=_headers())

    assert resp.status_code == 422


async def test_import_rejects_an_unknown_state_and_oversized_payload(client, mock_db):
    await _seed_site(mock_db)

    assert (await client.post(URL, json=_body(state="rejected"), headers=_headers())).status_code == 422
    too_many = _body(rows=[{"route": "/", "key": "k", "source": "s", "text": "t"}] * (MAX_IMPORT_ROWS + 1))
    assert (await client.post(URL, json=too_many, headers=_headers())).status_code == 422


async def test_import_route_does_not_shadow_translation_id_routes(client, mock_db):
    repo = await _seed_site(mock_db)
    doc_id = str((await repo.find_by_route("site1", "/"))[0]["_id"])

    resp = await client.get(f"/translations/{doc_id}", headers=_headers())

    assert resp.status_code == 200


async def test_import_accepts_exactly_the_maximum_number_of_rows(client, mock_db):
    await _seed_site(mock_db)
    rows = [{"route": "/", "key": f"k{i}", "source": f"s{i}", "text": ""} for i in range(MAX_IMPORT_ROWS)]

    resp = await client.post(URL, json=_body(rows=rows), headers=_headers())

    assert resp.status_code == 200
    assert resp.json()["skipped_blank"] == MAX_IMPORT_ROWS
    assert resp.json()["failed"] == 0


async def test_import_reports_an_invalid_route_per_row_not_for_the_whole_request(client, mock_db):
    repo = await _seed_site(mock_db)
    body = _body()
    body["rows"].append({"route": "/about?x=1", "key": sdk_rolling_hash("Other"), "source": "Other", "text": "x"})

    resp = await client.post(URL, json=body, headers=_headers())

    assert resp.status_code == 200
    assert resp.json()["updated"] == 1
    assert resp.json()["errors"] == [
        {"row": 2, "route": "/about?x=1", "key": sdk_rolling_hash("Other"), "reason": "invalid_route"}
    ]
    assert len(await repo.find_by_route("site1", "/about?x=1")) == 0
