from __future__ import annotations

import asyncio
import os
import uuid

import pytest
from pymongo import AsyncMongoClient
from pymongo.errors import DuplicateKeyError

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


@pytest.fixture
async def db():
    client = AsyncMongoClient(MONGO_URI)
    database = client[f"zz_website_indexes_{uuid.uuid4().hex[:8]}"]
    yield database
    await client.drop_database(database.name)
    await client.close()


@pytest.fixture
def service(db, monkeypatch):
    monkeypatch.setattr(onboarding_service_module, "get_settings", lambda: Settings(base_url="https://api.example.com"))
    return OnboardingService(db)


async def _legacy_site(db, site_id, domain, **extra):
    await db["websites"].insert_one({"tenant_id": TENANT, "site_id": site_id, "domain": domain, "status": "Active", **extra})


async def test_ensure_indexes_adds_the_unique_partial_index_next_to_the_lookup_index(db):
    await WebsiteRepository.ensure_indexes(db)
    await WebsiteRepository.ensure_indexes(db)

    indexes = await db["websites"].index_information()

    assert "unique" not in indexes["additional_domains_1"]
    assert indexes["additional_domains_unique"]["unique"] is True
    assert indexes["additional_domains_unique"]["partialFilterExpression"] == {"additional_domains.0": {"$exists": True}}


async def test_ensure_indexes_reconciles_a_deployed_non_unique_index_without_touching_data(db):
    await db["websites"].create_index("additional_domains")
    await _legacy_site(db, "s1", "a.com")
    await _legacy_site(db, "s2", "b.com", additional_domains=[])
    await _legacy_site(db, "s3", "c.com", additional_domains=["x.com"])
    before = await db["websites"].find({}, {"_id": 0}).to_list(length=None)

    await WebsiteRepository.ensure_indexes(db)

    assert {"additional_domains_1", "additional_domains_unique"} <= set(await db["websites"].index_information())
    assert await db["websites"].find({}, {"_id": 0}).to_list(length=None) == before


async def test_ensure_indexes_reports_existing_duplicate_claims_and_changes_nothing(db):
    await _legacy_site(db, "s1", "a.com", additional_domains=["dup.com"])
    await _legacy_site(db, "s2", "b.com", additional_domains=["dup.com", "other.com"])
    await _legacy_site(db, "s3", "c.com", additional_domains=["only-here.com", "only-here.com"])
    before = await db["websites"].find({}, {"_id": 0}).to_list(length=None)

    with pytest.raises(RuntimeError, match=r"dup\.com -> \['s1', 's2'\]") as excinfo:
        await WebsiteRepository.ensure_indexes(db)

    assert "only-here.com" not in str(excinfo.value)
    assert "additional_domains_unique" not in await db["websites"].index_information()
    assert await db["websites"].find({}, {"_id": 0}).to_list(length=None) == before


async def test_missing_and_empty_additional_domains_never_collide(db):
    await WebsiteRepository.ensure_indexes(db)

    await _legacy_site(db, "s1", "a.com")
    await _legacy_site(db, "s2", "b.com")
    await _legacy_site(db, "s3", "c.com", additional_domains=[])
    await _legacy_site(db, "s4", "d.com", additional_domains=[])

    assert await db["websites"].count_documents({}) == 4


async def test_database_rejects_a_duplicate_additional_domain_on_insert_and_update(db):
    repo = WebsiteRepository(db)
    await WebsiteRepository.ensure_indexes(db)
    await repo.create(TENANT, None, "a.com", "s1", additional_domains=["x.com"])
    other = await repo.create(TENANT, None, "b.com", "s2", additional_domains=["y.com"])

    with pytest.raises(DuplicateKeyError):
        await repo.create(TENANT, None, "c.com", "s3", additional_domains=["z.com", "x.com"])
    with pytest.raises(DuplicateKeyError):
        await repo.update(str(other["_id"]), TENANT, {"additional_domains": ["x.com"]})

    await repo.update(str(other["_id"]), TENANT, {"additional_domains": []})
    assert (await repo.find_by_domain("y.com")) is None


async def test_concurrent_claims_that_pass_the_precheck_are_closed_by_the_database(db, service, monkeypatch):
    await WebsiteRepository.ensure_indexes(db)
    monkeypatch.setattr(service, "_ensure_domains_unclaimed", lambda *args, **kwargs: asyncio.sleep(0))

    registered = await asyncio.gather(
        service.register_website(TENANT, None, "a.com", additional_domains=["race.com"]),
        service.register_website(TENANT, None, "b.com", additional_domains=["race.com"]),
        return_exceptions=True,
    )

    assert sorted(type(r).__name__ for r in registered) == ["ConflictError", "WebsiteResponse"]
    assert next(r for r in registered if isinstance(r, ConflictError)).message.startswith("Website with domain")
    winner = next(r for r in registered if not isinstance(r, ConflictError))
    other = await service.register_website(TENANT, None, "c.com")

    with pytest.raises(ConflictError, match=r"race\.com") as excinfo:
        await service.update_website(other.id, TENANT, {"additional_domains": ["race.com"]})

    assert "None" not in str(excinfo.value)
    assert await db["websites"].count_documents({"additional_domains": "race.com"}) == 1
    assert (await service.get_website(winner.id, TENANT)).additional_domains == ["race.com"]


async def test_domain_lookup_uses_an_index(db):
    await WebsiteRepository.ensure_indexes(db)

    plan = await db["websites"].find({"$or": [{"domain": "x.com"}, {"additional_domains": "x.com"}]}).explain()

    assert "COLLSCAN" not in str(plan["queryPlanner"]["winningPlan"])
