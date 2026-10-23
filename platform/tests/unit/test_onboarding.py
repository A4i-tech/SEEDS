
from __future__ import annotations

import importlib.util
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError as PydanticValidationError
from pymongo.errors import DuplicateKeyError

from app.models.requests.onboarding_requests import WebsiteCreateRequest, WebsiteUpdateRequest
from app.platform.error_handling import ConflictError, NotFoundError, ServiceUnavailableError
from app.repositories.website_repository import WebsiteRepository
from app.services.onboarding_service import OnboardingService
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


API_BASE = "https://api.example.com"
TENANT = "tenant-1"
OTHER_TENANT = "tenant-2"


@pytest.fixture(autouse=True)
def snippet_settings(monkeypatch):
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    monkeypatch.setattr(
        onboarding_service_module,
        "get_settings",
        lambda: Settings(base_url=API_BASE),
    )


@pytest.fixture
async def onboarding_service(mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)
    return OnboardingService(mock_db)


async def test_create_project(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    assert project.name == "Acme Corp"


async def test_register_website_generates_uuid_site_id(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    website = await onboarding_service.register_website(TENANT, project.id, "acme.com")

    assert website.domain == "acme.com"
    assert website.project_id == project.id
    assert len(website.site_id) == 36


async def test_register_website_raises_not_found_for_unknown_project(onboarding_service):
    with pytest.raises(NotFoundError):
        await onboarding_service.register_website(TENANT, "000000000000000000000000", "acme.com")


async def test_register_website_rejects_duplicate_domain(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    await onboarding_service.register_website(TENANT, project.id, "acme.com")
    with pytest.raises(ConflictError):
        await onboarding_service.register_website(TENANT, project.id, "acme.com")


def test_requests_normalize_dedupe_and_validate_domains():
    create = WebsiteCreateRequest(
        domain=" Apps.Acme.com ", additional_domains=[" LMS.Acme.com ", "lms.acme.com", "acme.com"]
    )
    update = WebsiteUpdateRequest(domain="APPS.acme.com", additional_domains=["ACME.com"])

    assert create.domain == "apps.acme.com"
    assert sorted(create.additional_domains) == ["acme.com", "lms.acme.com"]
    assert update.domain == "apps.acme.com"
    assert update.additional_domains == ["acme.com"]
    for bad in ("not a domain", "nodot", ""):
        with pytest.raises(PydanticValidationError):
            WebsiteCreateRequest(domain=bad)
        with pytest.raises(PydanticValidationError):
            WebsiteCreateRequest(domain="acme.com", additional_domains=[bad])
        with pytest.raises(PydanticValidationError):
            WebsiteUpdateRequest(domain=bad)
        with pytest.raises(PydanticValidationError):
            WebsiteUpdateRequest(additional_domains=[bad])


async def test_register_website_rejects_a_domain_already_claimed_by_another_site(onboarding_service, mock_db):
    await onboarding_service.register_website(TENANT, None, "primary.com", additional_domains=["extra.com"])

    with pytest.raises(ConflictError):
        await onboarding_service.register_website(OTHER_TENANT, None, "other.com", additional_domains=["primary.com"])
    with pytest.raises(ConflictError):
        await onboarding_service.register_website(OTHER_TENANT, None, "other.com", additional_domains=["extra.com"])
    with pytest.raises(ConflictError):
        await onboarding_service.register_website(OTHER_TENANT, None, "extra.com")

    assert await mock_db["websites"].count_documents({}) == 1


async def test_update_website_rejects_a_domain_claimed_by_another_site_and_changes_nothing(onboarding_service, mock_db):
    await onboarding_service.register_website(OTHER_TENANT, None, "taken.com", additional_domains=["taken-extra.com"])
    website = await onboarding_service.register_website(TENANT, None, "acme.com")
    before = await WebsiteRepository(mock_db).find_by_id_and_tenant(website.id, TENANT)

    for fields in (
        {"additional_domains": ["taken.com"]},
        {"additional_domains": ["taken-extra.com"]},
        {"domain": "taken-extra.com"},
    ):
        with pytest.raises(ConflictError):
            await onboarding_service.update_website(website.id, TENANT, fields)

    assert await WebsiteRepository(mock_db).find_by_id_and_tenant(website.id, TENANT) == before


async def test_update_website_maps_a_duplicate_key_race_on_domain_to_a_conflict(onboarding_service, mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)
    await onboarding_service.register_website(OTHER_TENANT, None, "taken.com")
    website = await onboarding_service.register_website(TENANT, None, "acme.com")
    onboarding_service._ensure_domains_unclaimed = AsyncMock()

    with pytest.raises(ConflictError):
        await onboarding_service.update_website(website.id, TENANT, {"domain": "taken.com"})


async def test_snippet_format(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    website = await onboarding_service.register_website(TENANT, project.id, "acme.com")

    assert website.api_base == API_BASE
    assert website.site_id


async def test_website_api_base_trims_trailing_slashes(onboarding_service, monkeypatch):
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    monkeypatch.setattr(
        onboarding_service_module,
        "get_settings",
        lambda: Settings(base_url="https://api.example.com/"),
    )
    website = await onboarding_service.register_website(TENANT, None, "acme.com")

    assert website.api_base == "https://api.example.com"


async def test_register_website_fails_loudly_and_creates_nothing_when_base_url_is_unset(
    onboarding_service, mock_db, monkeypatch
):
    from app.platform.error_handling import ConfigurationError
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    monkeypatch.setattr(
        onboarding_service_module,
        "get_settings",
        lambda: Settings(base_url=""),
    )

    with pytest.raises(ConfigurationError, match="BASE_URL"):
        await onboarding_service.register_website(TENANT, None, "acme.com")

    assert await mock_db["websites"].count_documents({}) == 0


async def test_register_website_without_a_project(onboarding_service):
    website = await onboarding_service.register_website(TENANT, None, "acme.com")

    assert website.project_id is None
    assert website.domain == "acme.com"
    assert len(website.site_id) == 36


async def test_website_create_request_project_id_is_optional():
    from app.models.requests.onboarding_requests import WebsiteCreateRequest

    assert WebsiteCreateRequest(domain="acme.com").project_id is None


def test_backend_no_longer_serves_a_second_copy_of_the_sdk():
    from fastapi.routing import _IncludedRouter

    from app.router import api_router

    def all_paths(router):
        paths = set()
        for route in router.routes:
            if isinstance(route, _IncludedRouter):
                paths |= all_paths(route.original_router)
            elif path := getattr(route, "path", None):
                paths.add(path)
        return paths

    assert "/sdk.js" not in all_paths(api_router)


async def test_update_website_updates_fields_and_returns_a_snippet(onboarding_service):
    website = await onboarding_service.register_website(TENANT, None, "acme.com", name="Acme")

    updated = await onboarding_service.update_website(
        website.id, TENANT, {"name": "Renamed", "status": "Inactive"}
    )

    assert updated.name == "Renamed"
    assert updated.status == "Inactive"
    assert updated.api_base == API_BASE


async def test_update_website_with_invalid_config_fails_without_modifying_the_website(
    onboarding_service, mock_db, monkeypatch
):
    from app.platform.error_handling import ConfigurationError
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    website = await onboarding_service.register_website(TENANT, None, "acme.com", name="Acme")
    before = await WebsiteRepository(mock_db).find_by_id_and_tenant(website.id, TENANT)

    monkeypatch.setattr(
        onboarding_service_module,
        "get_settings",
        lambda: Settings(base_url=""),
    )
    with pytest.raises(ConfigurationError, match="BASE_URL"):
        await onboarding_service.update_website(
            website.id, TENANT, {"name": "Changed", "domain": "changed.com", "status": "Inactive"}
        )

    assert await WebsiteRepository(mock_db).find_by_id_and_tenant(website.id, TENANT) == before


async def test_update_website_checks_config_before_anything_else(onboarding_service, monkeypatch):
    from app.platform.error_handling import ConfigurationError
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    monkeypatch.setattr(onboarding_service_module, "get_settings", lambda: Settings(base_url=""))

    with pytest.raises(ConfigurationError):
        await onboarding_service.update_website("000000000000000000000000", TENANT, {"name": "x"})


async def test_update_website_still_reports_unknown_ids_with_valid_config(onboarding_service):
    with pytest.raises(NotFoundError):
        await onboarding_service.update_website("000000000000000000000000", TENANT, {"name": "x"})


async def test_find_by_domain(mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)
    repo = WebsiteRepository(mock_db)
    await repo.create(TENANT, None, "acme.com", "site-1")

    assert (await repo.find_by_domain("acme.com"))["site_id"] == "site-1"
    assert await repo.find_by_domain("other.com") is None


async def test_get_website_raises_not_found_for_unknown_id(onboarding_service):
    with pytest.raises(NotFoundError):
        await onboarding_service.get_website("000000000000000000000000", TENANT)


async def test_website_indexes_are_unique(mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)
    repo = WebsiteRepository(mock_db)
    await repo.create(TENANT, "p1", "acme.com", "site-1")
    with pytest.raises(DuplicateKeyError):
        await repo.create(TENANT, "p1", "acme.com", "site-2")


async def test_domain_indexes_include_unique_partial_indexes_for_additional_and_claimed_domains(mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)

    indexes = await mock_db["websites"].index_information()

    assert "unique" not in indexes["additional_domains_1"]
    assert indexes["additional_domains_unique"]["unique"] is True
    assert indexes["additional_domains_unique"]["partialFilterExpression"] == {"additional_domains.0": {"$exists": True}}
    assert indexes["claimed_domains_unique"]["unique"] is True
    assert indexes["claimed_domains_unique"]["partialFilterExpression"] == {"claimed_domains.0": {"$exists": True}}


async def test_domain_writes_are_paused_while_a_website_lacks_claimed_domains(onboarding_service, mock_db):
    website = await onboarding_service.register_website(TENANT, None, "a.com")
    await mock_db["websites"].insert_one({"tenant_id": TENANT, "site_id": "legacy", "domain": "Legacy.com"})

    with pytest.raises(ServiceUnavailableError):
        await onboarding_service.register_website(TENANT, None, "b.com")
    with pytest.raises(ServiceUnavailableError):
        await onboarding_service.update_website(website.id, TENANT, {"domain": "c.com"})
    with pytest.raises(ServiceUnavailableError):
        await onboarding_service.update_website(website.id, TENANT, {"additional_domains": ["d.com"]})
    renamed = await onboarding_service.update_website(website.id, TENANT, {"name": "Renamed"})

    assert renamed.name == "Renamed"
    assert await mock_db["websites"].count_documents({}) == 2

    await mock_db["websites"].update_one({"site_id": "legacy"}, {"$set": {"claimed_domains": ["legacy.com"]}})
    assert (await onboarding_service.register_website(TENANT, None, "b.com")).domain == "b.com"


async def test_domain_writes_are_also_paused_for_null_or_malformed_claims(onboarding_service, mock_db):
    for claims in (None, "legacy.com", 5):
        await mock_db["websites"].delete_many({})
        await mock_db["websites"].insert_one(
            {"tenant_id": TENANT, "site_id": "odd", "domain": "legacy.com", "claimed_domains": claims}
        )
        with pytest.raises(ServiceUnavailableError):
            await onboarding_service.register_website(TENANT, None, "new.com")

    await mock_db["websites"].update_one({"site_id": "odd"}, {"$set": {"claimed_domains": ["legacy.com"]}})
    assert (await onboarding_service.register_website(TENANT, None, "new.com")).domain == "new.com"


async def test_pre_check_recognizes_a_migrated_site_by_its_normalized_claim(onboarding_service, mock_db):
    await mock_db["websites"].insert_one(
        {"tenant_id": TENANT, "site_id": "legacy", "domain": "X.com", "claimed_domains": ["x.com"]}
    )

    with pytest.raises(ConflictError):
        await onboarding_service.register_website(TENANT, None, "x.com")


async def test_claimed_domains_follow_domain_and_additional_domains(onboarding_service, mock_db):
    website = await onboarding_service.register_website(TENANT, None, "a.com", additional_domains=["b.com", "a.com"])
    stored = lambda: mock_db["websites"].find_one({"site_id": website.site_id})  # noqa: E731
    assert sorted((await stored())["claimed_domains"]) == ["a.com", "b.com"]

    await onboarding_service.update_website(website.id, TENANT, {"domain": "c.com"})
    assert sorted((await stored())["claimed_domains"]) == ["a.com", "b.com", "c.com"]

    await onboarding_service.update_website(website.id, TENANT, {"name": "$domain", "additional_domains": []})
    doc = await stored()
    assert doc["claimed_domains"] == ["c.com"] and doc["name"] == "$domain"


async def test_duplicate_key_on_additional_domains_is_mapped_to_a_conflict(onboarding_service):
    website = await onboarding_service.register_website(TENANT, None, "acme.com")
    onboarding_service._websites.create = AsyncMock(side_effect=DuplicateKeyError("duplicate"))
    onboarding_service._websites.update = AsyncMock(side_effect=DuplicateKeyError("duplicate"))

    with pytest.raises(ConflictError, match="extra.com"):
        await onboarding_service.register_website(TENANT, None, "other.com", additional_domains=["extra.com"])
    with pytest.raises(ConflictError, match="extra.com"):
        await onboarding_service.update_website(website.id, TENANT, {"additional_domains": ["extra.com"]})


async def test_register_website_with_languages_stores_them(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    website = await onboarding_service.register_website(
        TENANT,
        project.id,
        "acme.com",
        languages=[{"code": "hi", "enabled": True}, {"code": "ar", "enabled": False}],
    )
    assert website.languages == [{"code": "hi", "enabled": True}, {"code": "ar", "enabled": False}]


async def test_register_website_without_languages_defaults_to_empty_list(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    website = await onboarding_service.register_website(TENANT, project.id, "acme.com")
    assert website.languages == []


async def test_update_website_languages_replaces_the_list(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    website = await onboarding_service.register_website(TENANT, project.id, "acme.com")
    updated = await onboarding_service.update_website(
        website.id, TENANT, {"languages": [{"code": "bn", "enabled": True}]}
    )
    assert updated.languages == [{"code": "bn", "enabled": True}]


# --- Cross-tenant isolation (IDOR) ---------------------------------------


async def test_get_website_404s_for_a_different_tenant(onboarding_service):
    website = await onboarding_service.register_website(TENANT, None, "acme.com")
    with pytest.raises(NotFoundError):
        await onboarding_service.get_website(website.id, OTHER_TENANT)


async def test_update_website_404s_for_a_different_tenant_and_does_not_modify_it(onboarding_service, mock_db):
    website = await onboarding_service.register_website(TENANT, None, "acme.com")
    with pytest.raises(NotFoundError):
        await onboarding_service.update_website(website.id, OTHER_TENANT, {"name": "Hijacked"})

    unchanged = await WebsiteRepository(mock_db).find_by_id_and_tenant(website.id, TENANT)
    assert unchanged["name"] == ""


async def test_delete_website_404s_for_a_different_tenant_and_does_not_delete_it(onboarding_service, mock_db):
    website = await onboarding_service.register_website(TENANT, None, "acme.com")
    with pytest.raises(NotFoundError):
        await onboarding_service.delete_website(website.id, OTHER_TENANT)

    assert await WebsiteRepository(mock_db).find_by_id_and_tenant(website.id, TENANT) is not None


async def test_list_websites_only_returns_the_callers_own_sites(onboarding_service):
    await onboarding_service.register_website(TENANT, None, "acme.com")
    await onboarding_service.register_website(OTHER_TENANT, None, "other.com")

    mine = await onboarding_service.list_websites(TENANT)
    theirs = await onboarding_service.list_websites(OTHER_TENANT)

    assert [w.domain for w in mine] == ["acme.com"]
    assert [w.domain for w in theirs] == ["other.com"]


async def test_update_project_404s_for_a_different_tenant(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    with pytest.raises(NotFoundError):
        await onboarding_service.update_project(project.id, OTHER_TENANT, {"name": "Hijacked"})


async def test_delete_project_404s_for_a_different_tenant(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    with pytest.raises(NotFoundError):
        await onboarding_service.delete_project(project.id, OTHER_TENANT)


async def test_register_website_rejects_a_project_owned_by_a_different_tenant(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    with pytest.raises(NotFoundError):
        await onboarding_service.register_website(OTHER_TENANT, project.id, "other.com")


async def test_list_projects_only_returns_the_callers_own_projects(onboarding_service):
    await onboarding_service.create_project(TENANT, "Acme Corp")
    await onboarding_service.create_project(OTHER_TENANT, "Other Corp")

    mine = await onboarding_service.list_projects(TENANT)
    theirs = await onboarding_service.list_projects(OTHER_TENANT)

    assert [p.name for p in mine] == ["Acme Corp"]
    assert [p.name for p in theirs] == ["Other Corp"]


def _load_claims_migration():
    path = Path(__file__).resolve().parents[2] / "migrations" / "021_website_claimed_domains.py"
    spec = importlib.util.spec_from_file_location("migration_021_unit", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


class _FakeMongoClient:
    used: list[str]

    def __init__(self, *_args, **_kwargs):
        pass

    def __getitem__(self, name):
        type(self).used.append(name)
        return name

    async def close(self):
        pass


def _fake_run(**overrides):
    result = {"duplicates": {}, "unnormalizable": {}, "conflicts": [], "remaining": 0, **overrides}

    async def fake_run(db, dry_run):
        return result

    return fake_run


@pytest.mark.parametrize(
    ("uri", "expected_db"),
    [
        ("mongodb://localhost:27017/zz_explicit?retryWrites=true", "zz_explicit"),
        ("mongodb://localhost:27017", "seeds_platform"),
    ],
)
async def test_claims_migration_targets_the_database_the_application_uses(monkeypatch, uri, expected_db):
    import pymongo

    migration = _load_claims_migration()
    _FakeMongoClient.used = []
    monkeypatch.setattr(pymongo, "AsyncMongoClient", _FakeMongoClient)
    monkeypatch.setattr(migration, "run", _fake_run())

    await migration.migrate(uri, dry_run=False)

    assert _FakeMongoClient.used == [expected_db]


@pytest.mark.parametrize(
    "problem",
    [
        {"unnormalizable": {"s1": ["5"]}},
        {"duplicates": {"x.com": ["s1", "s2"]}},
        {"conflicts": [{"site_id": "s1", "error": "changed concurrently, re-run"}]},
        {"remaining": 1},
    ],
)
async def test_claims_migration_exits_non_zero_unless_everything_was_verified(monkeypatch, problem):
    import pymongo

    migration = _load_claims_migration()
    _FakeMongoClient.used = []
    monkeypatch.setattr(pymongo, "AsyncMongoClient", _FakeMongoClient)

    monkeypatch.setattr(migration, "run", _fake_run())
    await migration.migrate("mongodb://localhost:27017/zz_ok", dry_run=False)

    monkeypatch.setattr(migration, "run", _fake_run(**problem))
    with pytest.raises(SystemExit) as excinfo:
        await migration.migrate("mongodb://localhost:27017/zz_bad", dry_run=False)
    assert excinfo.value.code == 1
