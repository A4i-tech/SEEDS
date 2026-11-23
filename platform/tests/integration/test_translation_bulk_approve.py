
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.translation_repository import TranslationRepository
from tests.support.mongomock_async import AsyncMongoMockClient

pytestmark = pytest.mark.asyncio


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


def _token(role: str, user_id: str = "u1") -> str:
    return create_access_token({"sub": user_id, "role": role, "tenant_id": "t1"})


async def _seed(mock_db, langs=("hi",), *, site="site1", route="/h", key="t1"):
    repo = TranslationRepository(mock_db)
    await repo.upsert_source(site, route, key, "en", "Hello")
    for lang in langs:
        await repo.save_translation(site, route, key, lang, f"[{lang}] Hello", "P")
    return repo


async def test_bulk_approve_requires_auth(client):
    resp = await client.post("/translations/bulk-approve?site_id=site1", json={})
    assert resp.status_code == 401


async def test_bulk_approve_allows_tenant_role(client, mock_db):
    from app.repositories.website_repository import WebsiteRepository

    await WebsiteRepository.ensure_indexes(mock_db)
    await WebsiteRepository(mock_db).create("t1", None, "acme.com", "site1")
    await _seed(mock_db)

    resp = await client.post(
        "/translations/bulk-approve?site_id=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('tenant', user_id='t1')}"},
    )
    assert resp.status_code == 200


async def test_bulk_approve_forbids_school_admin_role(client):
    resp = await client.post(
        "/translations/bulk-approve?site_id=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('school_admin')}"},
    )
    assert resp.status_code == 403


async def test_bulk_approve_denies_a_different_tenants_site(client, mock_db):
    from app.repositories.website_repository import WebsiteRepository

    await WebsiteRepository.ensure_indexes(mock_db)
    await WebsiteRepository(mock_db).create("t1", None, "acme.com", "site1")
    await _seed(mock_db)

    resp = await client.post(
        "/translations/bulk-approve?site_id=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('tenant', user_id='t2')}"},
    )
    assert resp.status_code == 404




async def _rules_site(mock_db, langs=("hi",)):
    from app.repositories.translation_rule_repository import TranslationRuleRepository
    from app.repositories.website_repository import WebsiteRepository

    await WebsiteRepository.ensure_indexes(mock_db)
    await TranslationRuleRepository.ensure_indexes(mock_db)
    await WebsiteRepository(mock_db).create(
        "t1", None, "acme.com", "site1", languages=[{"code": c, "enabled": True} for c in langs]
    )


def _auth(role="tenant", user_id="t1"):
    return {"Authorization": f"Bearer {_token(role, user_id=user_id)}"}


OVERRIDE = {"kind": "override", "text": "Dates", "lang": "hi", "translation": "tarikh"}
EXCLUSION = {"kind": "exclusion", "text": r"\frac{*}{*}"}


async def test_rules_crud_round_trip(client, mock_db):
    await _rules_site(mock_db)

    created = await client.post("/translations/rules?site_id=site1", json=OVERRIDE, headers=_auth())
    assert created.status_code == 201
    rule_id = created.json()["id"]

    listed = await client.get("/translations/rules?site_id=site1", headers=_auth())
    assert [r["text"] for r in listed.json()] == ["Dates"]

    updated = await client.put(
        f"/translations/rules/{rule_id}", json={**OVERRIDE, "translation": "dinank"}, headers=_auth()
    )
    assert updated.status_code == 200
    assert updated.json()["translation"] == "dinank"

    deleted = await client.delete(f"/translations/rules/{rule_id}", headers=_auth())
    assert deleted.status_code == 204
    listed = await client.get("/translations/rules?site_id=site1", headers=_auth())
    assert listed.json() == []


async def test_rules_list_is_not_read_as_a_translation_id(client, mock_db):
    await _rules_site(mock_db)

    resp = await client.get("/translations/rules?site_id=site1", headers=_auth())

    assert resp.status_code == 200
    assert resp.json() == []


async def test_rules_require_the_reviewer_role(client, mock_db):
    await _rules_site(mock_db)

    resp = await client.post(
        "/translations/rules?site_id=site1", json=EXCLUSION, headers=_auth(role="school_admin")
    )

    assert resp.status_code == 403


async def test_rules_are_hidden_from_another_tenant(client, mock_db):
    await _rules_site(mock_db)
    created = await client.post("/translations/rules?site_id=site1", json=OVERRIDE, headers=_auth())
    rule_id = created.json()["id"]

    other = _auth(user_id="t2")
    assert (await client.get("/translations/rules?site_id=site1", headers=other)).status_code == 404
    assert (await client.post("/translations/rules?site_id=site1", json=EXCLUSION, headers=other)).status_code == 404
    assert (await client.put(f"/translations/rules/{rule_id}", json=OVERRIDE, headers=other)).status_code == 404
    assert (await client.delete(f"/translations/rules/{rule_id}", headers=other)).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "override", "text": "Dates"},
        {"kind": "exclusion", "text": "x", "translation": "y"},
        {"kind": "exclusion", "text": "**"},
        {"kind": "exclusion", "text": "   "},
        {"kind": "override", "text": "Foo", "lang": "hi", "translation": "   "},
        {"kind": "exclusion", "text": "a" * 5001},
        {"kind": "other", "text": "x"},
    ],
)
async def test_rules_reject_invalid_bodies(client, mock_db, body):
    await _rules_site(mock_db)

    resp = await client.post("/translations/rules?site_id=site1", json=body, headers=_auth())

    assert resp.status_code == 422


async def test_override_language_must_be_enabled_for_the_site(client, mock_db):
    await _rules_site(mock_db)

    resp = await client.post(
        "/translations/rules?site_id=site1", json={**OVERRIDE, "lang": "mr"}, headers=_auth()
    )

    assert resp.status_code == 422


async def test_duplicate_rule_returns_conflict_and_update_into_a_duplicate_too(client, mock_db):
    await _rules_site(mock_db)
    await client.post("/translations/rules?site_id=site1", json=OVERRIDE, headers=_auth())

    dup = await client.post("/translations/rules?site_id=site1", json=OVERRIDE, headers=_auth())
    assert dup.status_code == 409

    other = await client.post("/translations/rules?site_id=site1", json=EXCLUSION, headers=_auth())
    clash = await client.put(f"/translations/rules/{other.json()['id']}", json=OVERRIDE, headers=_auth())
    assert clash.status_code == 409

    same = await client.put(f"/translations/rules/{other.json()['id']}", json=EXCLUSION, headers=_auth())
    assert same.status_code == 200


async def test_site_rule_limit_is_enforced(client, mock_db, monkeypatch):
    from app.services import translation_service

    monkeypatch.setattr(translation_service, "MAX_RULES_PER_SITE", 2)
    await _rules_site(mock_db)
    for text in ("a", "b"):
        await client.post("/translations/rules?site_id=site1", json={"kind": "exclusion", "text": text}, headers=_auth())

    resp = await client.post("/translations/rules?site_id=site1", json={"kind": "exclusion", "text": "c"}, headers=_auth())

    assert resp.status_code == 422


async def test_rule_changes_are_audited_with_actor_and_values(client, mock_db):
    await _rules_site(mock_db)
    created = await client.post("/translations/rules?site_id=site1", json=OVERRIDE, headers=_auth())
    rule_id = created.json()["id"]
    await client.put(
        f"/translations/rules/{rule_id}", json={**OVERRIDE, "translation": "dinank"}, headers=_auth()
    )
    await client.delete(f"/translations/rules/{rule_id}", headers=_auth())

    audit = await client.get("/translations/audit?site_id=site1", headers=_auth())
    entries = {e["action"]: e for e in audit.json() if e["action"].startswith("rule_")}

    assert entries["rule_added"]["actor"] == "t1"
    assert "tarikh" in entries["rule_added"]["detail"]
    assert entries["rule_updated"]["actor"] == "t1"
    assert "tarikh" in entries["rule_updated"]["detail"] and "dinank" in entries["rule_updated"]["detail"]
    assert entries["rule_deleted"]["actor"] == "t1"


async def _add(client, body):
    resp = await client.post("/translations/rules?site_id=site1", json=body, headers=_auth())
    assert resp.status_code == 201
    return resp.json()["id"]


async def _rows(client):
    resp = await client.get("/translations/list?site_id=site1", headers=_auth())
    return {row["route"]: row for row in resp.json()}


async def test_list_marks_excluded_rows_with_rule_id_and_pattern(client, mock_db):
    await _rules_site(mock_db)
    await _seed(mock_db)
    rule_id = await _add(client, {"kind": "exclusion", "text": "Hel*"})

    row = (await _rows(client))["/h"]

    assert row["exclusion_rule_id"] == rule_id
    assert row["exclusion_pattern"] == "Hel*"
    assert row["shared"] == {}


async def test_list_marks_shared_languages_but_not_pages_with_their_own_approved_translation(client, mock_db):
    await _rules_site(mock_db, langs=("hi", "mr"))
    repo = await _seed(mock_db, langs=("hi", "mr"), route="/a")
    await _seed(mock_db, langs=("hi",), route="/b")
    docs = await repo.find_by_route("site1", "/b")
    await repo.approve_translation(str(docs[0]["_id"]), "hi", "rev", version=1)
    rule_id = await _add(client, {"kind": "override", "text": "Hello", "lang": "hi", "translation": "namaste"})

    rows = await _rows(client)

    assert rows["/a"]["shared"] == {"hi": {"rule_id": rule_id, "translation": "namaste"}}
    assert rows["/a"]["exclusion_rule_id"] == ""
    assert rows["/b"]["shared"] == {}


async def test_rules_are_listed_even_when_the_translation_list_is_capped(client, mock_db, monkeypatch):
    from app.repositories import translation_repository

    monkeypatch.setattr(translation_repository, "MAX_TRANSLATION_ROWS", 2)
    await _rules_site(mock_db)
    for route in ("/a", "/b", "/c"):
        await _seed(mock_db, route=route)
    await _add(client, {"kind": "exclusion", "text": "Hello"})

    rows = await client.get("/translations/list?site_id=site1", headers=_auth())
    rules = await client.get("/translations/rules?site_id=site1", headers=_auth())

    assert len(rows.json()) == 2
    assert len(rules.json()) == 1


async def test_bulk_approve_skips_excluded_rows_and_overridden_languages(client, mock_db):
    await _rules_site(mock_db, langs=("hi", "mr"))
    await _seed(mock_db, langs=("hi", "mr"), route="/shared")
    await _seed(mock_db, langs=("hi",), route="/other", key="t2")
    await mock_db["translations"].update_one({"route": "/other"}, {"$set": {"source_text": "Bye"}})
    await _seed(mock_db, langs=("hi",), route="/excluded", key="t3")
    await mock_db["translations"].update_one({"route": "/excluded"}, {"$set": {"source_text": r"\frac{1}{2}"}})
    await _add(client, {"kind": "override", "text": "Hello", "lang": "hi", "translation": "namaste"})
    await _add(client, {"kind": "exclusion", "text": r"\frac{*}{*}"})

    resp = await client.post("/translations/bulk-approve?site_id=site1", json={}, headers=_auth())

    assert resp.json() == {"approved": 2, "skipped": 2, "failed": 0}
    by_route = {d["route"]: d["translations"] for d in await mock_db["translations"].find({}).to_list(length=None)}
    assert by_route["/shared"]["hi"]["status"] == "pending"
    assert by_route["/shared"]["mr"]["status"] == "approved"
    assert by_route["/other"]["hi"]["status"] == "approved"
    assert by_route["/excluded"]["hi"]["status"] == "pending"


async def test_approve_and_edit_on_an_excluded_row_return_422(client, mock_db):
    await _rules_site(mock_db)
    repo = await _seed(mock_db)
    await _add(client, {"kind": "exclusion", "text": "Hello"})
    translation_id = str((await repo.find_by_route("site1", "/h"))[0]["_id"])

    approve = await client.post(
        f"/translations/{translation_id}/approve", json={"lang": "hi"}, headers=_auth()
    )
    edit = await client.put(
        f"/translations/{translation_id}", json={"lang": "hi", "text": "x"}, headers=_auth()
    )

    assert approve.status_code == 422
    assert edit.status_code == 422


async def test_editing_a_shared_row_saves_and_approves_it_for_that_page_only(client, mock_db):
    await _rules_site(mock_db)
    repo = await _seed(mock_db, route="/a")
    await _seed(mock_db, route="/b")
    rule_id = await _add(client, {"kind": "override", "text": "Hello", "lang": "hi", "translation": "namaste"})
    translation_id = str((await repo.find_by_route("site1", "/a"))[0]["_id"])

    edit = await client.put(
        f"/translations/{translation_id}", json={"lang": "hi", "text": "page text"}, headers=_auth()
    )

    assert edit.status_code == 200
    entry = edit.json()["translations"]["hi"]
    assert entry["text"] == "page text"
    assert entry["status"] == "approved"
    assert entry["approved_by"] == "t1"
    versions = await client.get(f"/translations/{translation_id}/versions", headers=_auth())
    assert len(versions.json()) == 1
    audit = await client.get("/translations/audit?site_id=site1", headers=_auth())
    assert {"edited", "approved"} <= {e["action"] for e in audit.json()}
    rules = await client.get("/translations/rules?site_id=site1", headers=_auth())
    assert [(r["id"], r["translation"]) for r in rules.json()] == [(rule_id, "namaste")]
    rows = await _rows(client)
    assert rows["/a"]["shared"] == {}
    assert rows["/b"]["shared"]["hi"]["translation"] == "namaste"


async def test_reject_on_an_excluded_row_returns_422_and_writes_no_audit(client, mock_db):
    await _rules_site(mock_db)
    repo = await _seed(mock_db)
    await _add(client, {"kind": "exclusion", "text": "Hello"})
    translation_id = str((await repo.find_by_route("site1", "/h"))[0]["_id"])

    reject = await client.post(
        f"/translations/{translation_id}/reject", json={"lang": "hi", "reason": "no"}, headers=_auth()
    )

    assert reject.status_code == 422
    assert await mock_db["translationAudit"].count_documents({"action": "rejected"}) == 0


async def test_blank_text_is_rejected_on_edit_and_on_approve(client, mock_db):
    await _rules_site(mock_db)
    repo = await _seed(mock_db)
    await _add(client, OVERRIDE)
    translation_id = str((await repo.find_by_route("site1", "/h"))[0]["_id"])

    edit = await client.put(f"/translations/{translation_id}", json={"lang": "hi", "text": "  "}, headers=_auth())
    await mock_db["translations"].update_one({}, {"$set": {"translations.hi.text": " "}})
    approve = await client.post(f"/translations/{translation_id}/approve", json={"lang": "hi"}, headers=_auth())

    assert edit.status_code == 422
    assert approve.status_code == 422
