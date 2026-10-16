from __future__ import annotations

import asyncio
import importlib.util
import os
import uuid
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from pymongo import AsyncMongoClient
from pymongo.errors import DuplicateKeyError

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.platform.error_handling import ConflictError
from app.platform.settings import Settings
from app.repositories.website_repository import WebsiteRepository
from app.services import onboarding_service as onboarding_service_module
from app.services.onboarding_service import OnboardingService

MONGO_URI = os.environ.get("SEEDS_TEST_MONGO_URI")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not MONGO_URI, reason="SEEDS_TEST_MONGO_URI is not set (needs a real MongoDB)"),
]

TENANT = "tenant-1"
MIGRATION_PATH = Path(__file__).resolve().parents[2] / "migrations" / "021_website_claimed_domains.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("migration_021", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
async def db():
    client = AsyncMongoClient(MONGO_URI)
    database = client[f"zz_website_claims_{uuid.uuid4().hex[:8]}"]
    await WebsiteRepository.ensure_indexes(database)
    yield database
    await client.drop_database(database.name)
    await client.close()


@pytest.fixture
def service(db, monkeypatch):
    monkeypatch.setattr(onboarding_service_module, "get_settings", lambda: Settings(base_url="https://api.example.com"))
    return OnboardingService(db)


@pytest.fixture
def skip_precheck(service, monkeypatch):
    monkeypatch.setattr(service, "_ensure_domains_unclaimed", lambda *args, **kwargs: asyncio.sleep(0))


async def _claims(db, site_id):
    return sorted((await db["websites"].find_one({"site_id": site_id}))["claimed_domains"])


async def _legacy_site(db, site_id, domain, **extra):
    await db["websites"].insert_one({"tenant_id": TENANT, "site_id": site_id, "domain": domain, "status": "Active", **extra})


async def test_every_domain_claim_conflicts_in_any_combination_of_primary_and_additional(db):
    repo = WebsiteRepository(db)
    await repo.create(TENANT, None, "primary.com", "s1", additional_domains=["extra.com"])

    for domain, additional in (
        ("other.com", ["primary.com"]),
        ("extra.com", []),
        ("other.com", ["extra.com"]),
        ("primary.com", []),
    ):
        with pytest.raises(DuplicateKeyError):
            await repo.create(TENANT, None, domain, "s2", additional_domains=additional)

    assert await db["websites"].count_documents({}) == 1


async def test_database_rejects_primary_vs_additional_in_both_registration_orders(service, skip_precheck):
    await service.register_website(TENANT, None, "x.com")
    with pytest.raises(ConflictError, match=r"x\.com"):
        await service.register_website(TENANT, None, "y.com", additional_domains=["x.com"])

    await service.register_website(TENANT, None, "a.com", additional_domains=["z.com"])
    with pytest.raises(ConflictError, match=r"z\.com"):
        await service.register_website(TENANT, None, "z.com")


async def test_concurrent_primary_and_additional_claims_cannot_both_succeed(db, service, skip_precheck):
    results = await asyncio.gather(
        service.register_website(TENANT, None, "x.com"),
        service.register_website(TENANT, None, "y.com", additional_domains=["x.com"]),
        return_exceptions=True,
    )

    assert sorted(type(r).__name__ for r in results) == ["ConflictError", "WebsiteResponse"]
    assert await db["websites"].count_documents({"claimed_domains": "x.com"}) == 1


async def test_database_rejects_conflicting_updates_and_a_released_claim_can_be_taken(db, service, skip_precheck):
    first = await service.register_website(TENANT, None, "a.com", additional_domains=["held.com"])
    second = await service.register_website(TENANT, None, "b.com")

    with pytest.raises(ConflictError, match=r"held\.com"):
        await service.update_website(second.id, TENANT, {"additional_domains": ["held.com"]})
    with pytest.raises(ConflictError, match=r"a\.com"):
        await service.update_website(second.id, TENANT, {"domain": "a.com"})
    assert await _claims(db, second.site_id) == ["b.com"]

    await service.update_website(first.id, TENANT, {"additional_domains": []})
    await service.update_website(second.id, TENANT, {"additional_domains": ["held.com"]})

    assert await _claims(db, first.site_id) == ["a.com"]
    assert await _claims(db, second.site_id) == ["b.com", "held.com"]


async def test_updates_add_replace_and_remove_claims(db, service):
    site = await service.register_website(TENANT, None, "a.com", additional_domains=["one.com"])

    await service.update_website(site.id, TENANT, {"additional_domains": ["two.com", "three.com"]})
    assert await _claims(db, site.site_id) == ["a.com", "three.com", "two.com"]

    await service.update_website(site.id, TENANT, {"domain": "b.com"})
    assert await _claims(db, site.site_id) == ["b.com", "three.com", "two.com"]

    await service.update_website(site.id, TENANT, {"name": "Renamed"})
    assert await _claims(db, site.site_id) == ["b.com", "three.com", "two.com"]

    await service.update_website(site.id, TENANT, {"additional_domains": []})
    assert await _claims(db, site.site_id) == ["b.com"]


async def test_free_text_update_values_are_stored_literally(db, service):
    site = await service.register_website(TENANT, None, "a.com")

    await service.update_website(site.id, TENANT, {"name": "$domain", "additional_domains": ["b.com"]})

    stored = await db["websites"].find_one({"site_id": site.site_id})
    assert stored["name"] == "$domain"
    assert sorted(stored["claimed_domains"]) == ["a.com", "b.com"]


async def test_concurrent_updates_to_different_domain_fields_keep_claims_consistent(db, service):
    for attempt in range(10):
        site = await service.register_website(TENANT, None, f"start{attempt}.com", additional_domains=[f"old{attempt}.com"])

        await asyncio.gather(
            service.update_website(site.id, TENANT, {"domain": f"new{attempt}.com"}),
            service.update_website(site.id, TENANT, {"additional_domains": [f"extra{attempt}.com", f"more{attempt}.com"]}),
        )

        stored = await db["websites"].find_one({"site_id": site.site_id})
        assert stored["domain"] == f"new{attempt}.com"
        assert stored["additional_domains"] == [f"extra{attempt}.com", f"more{attempt}.com"]
        assert sorted(stored["claimed_domains"]) == sorted([stored["domain"], *stored["additional_domains"]])


async def test_http_returns_409_when_the_database_rejects_a_claim(db, monkeypatch):
    monkeypatch.setattr(onboarding_service_module, "get_settings", lambda: Settings(base_url="https://api.example.com"))
    monkeypatch.setattr(OnboardingService, "_ensure_domains_unclaimed", lambda *args, **kwargs: asyncio.sleep(0))

    async def _override_db():
        return db

    app.dependency_overrides[get_db] = _override_db
    headers = {"Authorization": f"Bearer {create_access_token({'sub': TENANT, 'role': 'tenant'})}"}
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            first = await client.post("/websites", json={"domain": "x.com"}, headers=headers)
            conflict = await client.post("/websites", json={"domain": "y.com", "additional_domains": ["x.com"]}, headers=headers)
            other = (await client.post("/websites", json={"domain": "z.com"}, headers=headers)).json()
            update_conflict = await client.put(
                f"/websites/{other['id']}", json={"additional_domains": ["x.com"]}, headers=headers
            )
    finally:
        app.dependency_overrides.clear()

    assert first.status_code == 200
    assert conflict.status_code == 409
    assert "x.com" in conflict.json()["message"]
    assert update_conflict.status_code == 409


async def test_migration_backfills_legacy_records_with_normalized_claims_and_is_idempotent(db):
    migration = _load_migration()
    await _legacy_site(db, "s1", "Legacy.COM")
    await _legacy_site(db, "s2", "b.com", additional_domains=[])
    await _legacy_site(db, "s3", "c.com", additional_domains=[" D.com ", "d.com", "c.com"])
    await _legacy_site(db, "s4", "")

    first = await migration.run(db, dry_run=False)
    second = await migration.run(db, dry_run=False)

    assert first["backfilled"] == 4 and first["remaining"] == 0 and not first["conflicts"]
    assert second["backfilled"] == 0 and second["remaining"] == 0
    assert await _claims(db, "s1") == ["legacy.com"]
    assert await _claims(db, "s2") == ["b.com"]
    assert await _claims(db, "s3") == ["c.com", "d.com"]
    assert await _claims(db, "s4") == []
    assert (await db["websites"].find_one({"site_id": "s1"}))["domain"] == "Legacy.COM"
    assert (await db["websites"].index_information())["claimed_domains_unique"]["unique"] is True


async def test_migration_reports_duplicate_claims_across_fields_and_writes_nothing(db):
    migration = _load_migration()
    await db["websites"].drop_index("claimed_domains_unique")
    await _legacy_site(db, "s1", "Example.com")
    await _legacy_site(db, "s2", "other.com", additional_domains=["EXAMPLE.com"])
    await _legacy_site(db, "s3", "fine.com")
    before = await db["websites"].find({}, {"_id": 0}).to_list(length=None)

    result = await migration.run(db, dry_run=False)

    assert result["duplicates"] == {"example.com": ["s1", "s2"]}
    assert result["backfilled"] == 0
    assert await db["websites"].find({}, {"_id": 0}).to_list(length=None) == before
    assert "claimed_domains_unique" not in await db["websites"].index_information()


async def test_migration_dry_run_writes_nothing_and_a_restart_only_touches_remaining_documents(db):
    migration = _load_migration()
    await _legacy_site(db, "s1", "a.com")
    await _legacy_site(db, "s2", "b.com")
    before = await db["websites"].find({}, {"_id": 0}).to_list(length=None)

    dry = await migration.run(db, dry_run=True)
    assert dry["remaining"] == 2
    assert await db["websites"].find({}, {"_id": 0}).to_list(length=None) == before

    await db["websites"].update_one({"site_id": "s1"}, {"$set": {"claimed_domains": ["a.com"]}})
    resumed = await migration.run(db, dry_run=False)

    assert resumed["backfilled"] == 1 and resumed["remaining"] == 0


async def test_migration_retries_a_document_that_changed_after_it_was_read(db):
    migration = _load_migration()
    await _legacy_site(db, "s1", "a.com", additional_domains=["old.com"])
    changed = False

    class Collection:
        def __init__(self, collection):
            self._collection = collection

        async def update_one(self, *args, **kwargs):
            nonlocal changed
            if not changed:
                changed = True
                await self._collection.update_one({"site_id": "s1"}, {"$set": {"additional_domains": ["new.com"]}})
            return await self._collection.update_one(*args, **kwargs)

        def __getattr__(self, name):
            return getattr(self._collection, name)

    class Database:
        def __getitem__(self, name):
            return Collection(db[name]) if name == "websites" else db[name]

        def __getattr__(self, name):
            return getattr(db, name)

    result = await migration.run(Database(), dry_run=False)

    assert changed and result["backfilled"] == 1 and result["remaining"] == 0
    assert await _claims(db, "s1") == ["a.com", "new.com"]
