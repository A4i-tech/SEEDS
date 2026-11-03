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
from app.platform.domain import claimed_domains
from app.platform.error_handling import ConflictError, ServiceUnavailableError
from app.platform.settings import Settings
from app.repositories.website_repository import _CLAIMED_DOMAINS, WebsiteRepository
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
    module.CONFIRM_DELAY_SECONDS = 0
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
    await _legacy_site(db, "s3", "c.com", additional_domains=["d.com", "d.com", "c.com"])
    await _legacy_site(db, "s4", "d4.com")

    first = await migration.run(db, dry_run=False)
    second = await migration.run(db, dry_run=False)

    assert first["backfilled"] == 4 and first["remaining"] == 0 and not first["conflicts"]
    assert second["backfilled"] == 0 and second["remaining"] == 0
    assert await _claims(db, "s1") == ["legacy.com"]
    assert await _claims(db, "s2") == ["b.com"]
    assert await _claims(db, "s3") == ["c.com", "d.com"]
    assert await _claims(db, "s4") == ["d4.com"]
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


class _FlakyWebsites:
    def __init__(self, collection, update_one):
        self._collection = collection
        self.update_one = update_one

    def __getattr__(self, name):
        return getattr(self._collection, name)


def _database_with(db, update_one_factory):
    class Database:
        def __getitem__(self, name):
            return _FlakyWebsites(db[name], update_one_factory(db[name])) if name == "websites" else db[name]

        def __getattr__(self, name):
            return getattr(db, name)

    return Database()


async def test_legacy_uppercase_claim_cannot_race_a_registration_of_the_lowercase_hostname(db, service):
    migration = _load_migration()
    await _legacy_site(db, "legacy", "X.com")

    with pytest.raises(ServiceUnavailableError):
        await service.register_website(TENANT, None, "x.com")
    assert await db["websites"].count_documents({}) == 1

    result = await migration.run(db, dry_run=False)
    assert migration.succeeded(result)

    with pytest.raises(ConflictError, match=r"x\.com"):
        await service.register_website(TENANT, None, "x.com")
    assert await _claims(db, "legacy") == ["x.com"]


async def test_the_gate_is_what_prevents_the_legacy_collision(db, service, monkeypatch):
    migration = _load_migration()
    await _legacy_site(db, "legacy", "X.com")
    monkeypatch.setattr(WebsiteRepository, "has_unclaimed_websites", lambda self: asyncio.sleep(0, result=False))

    await service.register_website(TENANT, None, "x.com")
    result = await migration.run(db, dry_run=False)

    assert result["duplicates"] and not migration.succeeded(result)


async def test_legacy_additional_domain_claims_are_gated_for_register_and_update(db, service):
    migration = _load_migration()
    mine = await service.register_website(TENANT, None, "mine.com")
    await db["websites"].update_one({"site_id": mine.site_id}, {"$unset": {"claimed_domains": ""}})
    await _legacy_site(db, "legacy", "legacy.com", additional_domains=["shared.com"])

    with pytest.raises(ServiceUnavailableError):
        await service.register_website(TENANT, None, "shared.com")
    with pytest.raises(ServiceUnavailableError):
        await service.update_website(mine.id, TENANT, {"additional_domains": ["shared.com"]})
    renamed = await service.update_website(mine.id, TENANT, {"name": "Renamed"})
    assert renamed.name == "Renamed"

    assert migration.succeeded(await migration.run(db, dry_run=False))
    with pytest.raises(ConflictError, match=r"shared\.com"):
        await service.update_website(mine.id, TENANT, {"additional_domains": ["shared.com"]})


async def _paused_register(service, domain):
    gate_passed, release = asyncio.Event(), asyncio.Event()
    original = service._ensure_domains_unclaimed

    async def paused(*args, **kwargs):
        gate_passed.set()
        await release.wait()
        return await original(*args, **kwargs)

    service._ensure_domains_unclaimed = paused
    task = asyncio.create_task(service.register_website(TENANT, None, domain))
    await gate_passed.wait()
    return task, release


async def test_a_write_in_flight_when_a_legacy_site_appears_is_caught_by_the_migration_not_reported_as_success(db, service):
    migration = _load_migration()
    in_flight, release = await _paused_register(service, "x.com")
    await _legacy_site(db, "legacy", "X.com")
    release.set()
    await in_flight
    before = await db["websites"].find({}, {"_id": 0}).to_list(length=None)

    result = await migration.run(db, dry_run=False)

    assert list(result["duplicates"]) == ["x.com"] and len(result["duplicates"]["x.com"]) == 2
    assert not migration.succeeded(result)
    assert await db["websites"].find({}, {"_id": 0}).to_list(length=None) == before


async def test_a_write_in_flight_while_the_migration_completes_still_hits_the_unique_index(db, service):
    migration = _load_migration()
    in_flight, release = await _paused_register(service, "x.com")
    await _legacy_site(db, "legacy", "X.com")
    assert migration.succeeded(await migration.run(db, dry_run=False))
    release.set()

    with pytest.raises(ConflictError):
        await in_flight
    assert await db["websites"].count_documents({"claimed_domains": "x.com"}) == 1


async def test_registrations_racing_a_running_migration_never_acquire_a_conflicting_claim(db, service):
    migration = _load_migration()
    await _legacy_site(db, "legacy", "X.com")
    await _legacy_site(db, "other", "other.com", additional_domains=["held.com"])

    async def attempt(domain, additional):
        try:
            await service.register_website(TENANT, None, domain, additional_domains=additional)
            return "registered"
        except (ServiceUnavailableError, ConflictError) as exc:
            return type(exc).__name__

    attempts = [attempt("x.com", []) for _ in range(15)] + [attempt(f"new{i}.com", ["held.com"]) for i in range(15)]
    outcomes = (await asyncio.gather(migration.run(db, dry_run=False), *attempts))[1:]

    assert "registered" not in outcomes
    docs = await db["websites"].find({}).to_list(length=None)
    assert migration.find_duplicate_claims(docs) == {}
    assert all("claimed_domains" in doc for doc in docs)


async def test_migration_is_not_reported_successful_while_a_website_lacks_claimed_domains(db):
    migration = _load_migration()
    await _legacy_site(db, "s1", "a.com")

    def never_matches(collection):
        async def update_one(*args, **kwargs):
            class Result:
                matched_count = 0

            return Result()

        return update_one

    result = await migration.run(_database_with(db, never_matches), dry_run=False)

    assert result["conflicts"] and result["remaining"] == 1 and not migration.succeeded(result)
    assert await WebsiteRepository(db).has_unclaimed_websites()


async def test_an_interrupted_migration_keeps_the_gate_closed_and_resumes_safely(db, service):
    migration = _load_migration()
    for site_id, domain in (("s1", "a.com"), ("s2", "b.com"), ("s3", "c.com")):
        await _legacy_site(db, site_id, domain)

    def crash_on_second_write(collection):
        calls = 0

        async def update_one(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("process killed")
            return await collection.update_one(*args, **kwargs)

        return update_one

    with pytest.raises(RuntimeError, match="process killed"):
        await migration.run(_database_with(db, crash_on_second_write), dry_run=False)

    assert await WebsiteRepository(db).has_unclaimed_websites()
    with pytest.raises(ServiceUnavailableError):
        await service.register_website(TENANT, None, "new.com")

    resumed = await migration.run(db, dry_run=False)

    assert migration.succeeded(resumed) and resumed["backfilled"] == 2
    assert not await WebsiteRepository(db).has_unclaimed_websites()
    assert (await service.register_website(TENANT, None, "new.com")).domain == "new.com"


async def test_migration_refuses_domains_it_cannot_normalize_without_writing(db):
    migration = _load_migration()
    await _legacy_site(db, "s1", " spaced.com")
    await _legacy_site(db, "s2", "ok.com", additional_domains=["Upper.com"])
    before = await db["websites"].find({}, {"_id": 0}).to_list(length=None)

    result = await migration.run(db, dry_run=False)

    assert set(result["unnormalizable"]) == {"s1", "s2"} and not migration.succeeded(result)
    assert await db["websites"].find({}, {"_id": 0}).to_list(length=None) == before


async def test_python_normalization_matches_the_server_side_expression(db):
    cases = [
        ("Example.COM", ["b.com", "x.com", "x.com"]),
        ("y.com", []),
        ("", ["a.com"]),
        ("c.com", None),
        ("d.com", ["d.com"]),
        (" spaced.com ", ["Up.com"]),
        ("a b.com", None),
    ]
    for index, (domain, additional) in enumerate(cases):
        extra = {"additional_domains": additional} if additional is not None else {}
        await db["websites"].insert_one({"site_id": f"s{index}", "domain": domain, **extra})

    projected = await (
        await db["websites"].aggregate(
            [{"$project": {"_id": 0, "domain": 1, "additional_domains": 1, "server": _CLAIMED_DOMAINS}}]
        )
    ).to_list(length=None)

    assert len(projected) == len(cases)
    for row in projected:
        assert sorted(row["server"]) == sorted(claimed_domains(row["domain"], row.get("additional_domains")))


async def _assert_claims_invariants(db, migration):
    docs = await db["websites"].find({}).to_list(length=None)
    assert migration.find_duplicate_claims(docs) == {}
    for doc in docs:
        assert sorted(doc["claimed_domains"]) == sorted(claimed_domains(doc["domain"], doc.get("additional_domains")))


async def _random_writes(service, rng, count):
    hostnames = [f"h{i}.com" for i in range(8)]
    sites = [await service.register_website(TENANT, None, f"base{i}.com") for i in range(4)]

    async def one(_):
        site = rng.choice(sites)
        picked = rng.sample(hostnames, rng.randint(0, 3))
        action = rng.choice(["register", "additional", "domain", "clear"])
        try:
            if action == "register":
                await service.register_website(TENANT, None, rng.choice(hostnames), additional_domains=picked)
            elif action == "additional":
                await service.update_website(site.id, TENANT, {"additional_domains": picked})
            elif action == "domain":
                await service.update_website(site.id, TENANT, {"domain": rng.choice(hostnames)})
            else:
                await service.update_website(site.id, TENANT, {"additional_domains": []})
        except ConflictError:
            return "conflict"
        return "ok"

    return await asyncio.gather(*(one(i) for i in range(count)))


async def test_random_concurrent_registrations_and_updates_never_leave_conflicting_claims(db, service):
    import random

    migration = _load_migration()
    assert migration.succeeded(await migration.run(db, dry_run=False))

    outcomes = await _random_writes(service, random.Random(347), 120)

    assert "conflict" in outcomes and "ok" in outcomes
    await _assert_claims_invariants(db, migration)


async def test_rerunning_the_migration_while_writes_continue_keeps_the_claims_consistent(db, service):
    import random

    migration = _load_migration()
    assert migration.succeeded(await migration.run(db, dry_run=False))

    results = await asyncio.gather(migration.run(db, dry_run=False), _random_writes(service, random.Random(11), 80))

    assert not results[0]["conflicts"]
    assert migration.succeeded(results[0]) or results[0]["duplicates"]
    assert not await WebsiteRepository(db).has_unclaimed_websites()
    await _assert_claims_invariants(db, migration)


async def test_a_duplicate_seen_only_in_one_live_scan_is_not_reported(db):
    migration = _load_migration()
    await _legacy_site(db, "s1", "a.com")
    await _legacy_site(db, "s2", "b.com")
    scans = 0

    class TransientDuplicate:
        def __init__(self, cursor):
            self._cursor = cursor

        async def to_list(self, length=None):
            return [{**doc, "domain": "a.com"} for doc in await self._cursor.to_list(length)]

    class Collection:
        def __init__(self, collection):
            self._collection = collection

        def find(self, *args, **kwargs):
            nonlocal scans
            scans += 1
            cursor = self._collection.find(*args, **kwargs)
            return TransientDuplicate(cursor) if scans == 1 else cursor

        def __getattr__(self, name):
            return getattr(self._collection, name)

    class Database:
        def __getitem__(self, name):
            return Collection(db[name]) if name == "websites" else db[name]

        def __getattr__(self, name):
            return getattr(db, name)

    result = await migration.run(Database(), dry_run=False)

    assert scans >= 2 and not result["duplicates"] and migration.succeeded(result)


async def test_migration_preflight_reports_every_malformed_legacy_site_and_never_succeeds(db):
    migration = _load_migration()
    await db["websites"].drop_index("domain_1")
    legacy = {
        "numeric-domain": {"domain": 5},
        "null-domain": {"domain": None},
        "missing-domain": {},
        "empty-domain": {"domain": ""},
        "whitespace-domain": {"domain": " spaced.com"},
        "newline-domain": {"domain": "newline.com\n"},
        "no-dot-domain": {"domain": "nodot"},
        "numeric-additional": {"domain": "n1.com", "additional_domains": [5]},
        "string-additional": {"domain": "n2.com", "additional_domains": "n2x.com"},
        "uppercase-additional": {"domain": "n3.com", "additional_domains": ["N3X.com"]},
        "null-element-additional": {"domain": "n4.com", "additional_domains": [None]},
    }
    for site_id, fields in legacy.items():
        await db["websites"].insert_one({"tenant_id": TENANT, "site_id": site_id, "status": "Active", **fields})
    await _legacy_site(db, "valid", "valid.com", additional_domains=["valid2.com"])
    before = await db["websites"].find({}, {"_id": 0}).to_list(length=None)

    result = await migration.run(db, dry_run=False)

    assert set(result["unnormalizable"]) == set(legacy)
    assert "valid" not in result["unnormalizable"]
    assert not migration.succeeded(result)
    assert await db["websites"].find({}, {"_id": 0}).to_list(length=None) == before
    assert (await migration.run(db, dry_run=True))["unnormalizable"] == result["unnormalizable"]


async def test_service_writes_pass_after_the_migration_and_conflicts_still_return_409(db, service):
    migration = _load_migration()
    assert migration.succeeded(await migration.run(db, dry_run=False))

    site = await service.register_website(TENANT, None, "a.com", additional_domains=["b.com"])
    await service.update_website(site.id, TENANT, {"domain": "c.com", "additional_domains": ["d.com"]})
    await service.update_website(site.id, TENANT, {"name": "Renamed", "status": "Inactive"})
    with pytest.raises(ConflictError):
        await service.register_website(TENANT, None, "d.com")

    assert await _claims(db, site.site_id) == ["c.com", "d.com"]
    await service.delete_website(site.id, TENANT)
    assert (await service.register_website(TENANT, None, "d.com")).domain == "d.com"


async def test_concurrent_primary_and_additional_claims_cannot_both_succeed_after_the_migration(db, service, skip_precheck):
    migration = _load_migration()
    assert migration.succeeded(await migration.run(db, dry_run=False))

    results = await asyncio.gather(
        service.register_website(TENANT, None, "x.com"),
        service.register_website(TENANT, None, "y.com", additional_domains=["x.com"]),
        service.register_website(TENANT, None, "z.com", additional_domains=["x.com"]),
        return_exceptions=True,
    )

    assert sorted(type(r).__name__ for r in results) == ["ConflictError", "ConflictError", "WebsiteResponse"]
    assert await db["websites"].count_documents({"claimed_domains": "x.com"}) == 1
