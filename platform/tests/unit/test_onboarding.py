
from __future__ import annotations

import pytest
from pymongo.errors import DuplicateKeyError

from app.platform.error_handling import ConflictError, NotFoundError, ValidationError
from app.repositories.website_repository import WebsiteRepository
from app.services.onboarding_service import OnboardingService, build_snippet
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


SDK_BASE = "https://app.example.com"
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
        lambda: Settings(translation_sdk_base_url=SDK_BASE, base_url=API_BASE),
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


async def test_register_website_rejects_invalid_domain(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    with pytest.raises(ValidationError):
        await onboarding_service.register_website(TENANT, project.id, "not a domain")


async def test_register_website_rejects_duplicate_domain(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    await onboarding_service.register_website(TENANT, project.id, "acme.com")
    with pytest.raises(ConflictError):
        await onboarding_service.register_website(TENANT, project.id, "acme.com")


async def test_snippet_format(onboarding_service):
    project = await onboarding_service.create_project(TENANT, "Acme Corp")
    website = await onboarding_service.register_website(TENANT, project.id, "acme.com")
    snippet = website.snippet

    assert f'src="{SDK_BASE}/sdk.js"' in snippet
    assert f'data-site-id="{website.site_id}"' in snippet
    assert f'data-api-base="{API_BASE}"' in snippet
    assert "defer" in snippet


def test_build_snippet_exact_format():
    snippet = build_snippet("https://app.example.com", "https://api.example.com", "abc-123")
    assert snippet == (
        "<script\n"
        '  src="https://app.example.com/sdk.js"\n'
        '  data-site-id="abc-123"\n'
        '  data-api-base="https://api.example.com"\n'
        "  defer>\n"
        "</script>"
    )


async def test_snippet_uses_separate_sdk_and_api_origins_and_trims_trailing_slashes(onboarding_service, monkeypatch):
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    monkeypatch.setattr(
        onboarding_service_module,
        "get_settings",
        lambda: Settings(translation_sdk_base_url="https://sdk.example.com/", base_url="https://api.example.com/"),
    )
    website = await onboarding_service.register_website(TENANT, None, "acme.com")

    assert 'src="https://sdk.example.com/sdk.js"' in website.snippet
    assert 'data-api-base="https://api.example.com"' in website.snippet


@pytest.mark.parametrize(
    "sdk_base,api_base",
    [("", API_BASE), (SDK_BASE, ""), ("", "")],
)
async def test_register_website_fails_loudly_and_creates_nothing_when_snippet_urls_are_unset(
    onboarding_service, mock_db, monkeypatch, sdk_base, api_base
):
    from app.platform.error_handling import ConfigurationError
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    monkeypatch.setattr(
        onboarding_service_module,
        "get_settings",
        lambda: Settings(translation_sdk_base_url=sdk_base, base_url=api_base),
    )

    with pytest.raises(ConfigurationError, match="TRANSLATION_SDK_BASE_URL"):
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
    assert f'src="{SDK_BASE}/sdk.js"' in updated.snippet
    assert f'data-api-base="{API_BASE}"' in updated.snippet


@pytest.mark.parametrize(
    "sdk_base,api_base",
    [("", API_BASE), (SDK_BASE, ""), ("", "")],
)
async def test_update_website_with_invalid_config_fails_without_modifying_the_website(
    onboarding_service, mock_db, monkeypatch, sdk_base, api_base
):
    from app.platform.error_handling import ConfigurationError
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    website = await onboarding_service.register_website(TENANT, None, "acme.com", name="Acme")
    before = await WebsiteRepository(mock_db).find_by_id_and_tenant(website.id, TENANT)

    monkeypatch.setattr(
        onboarding_service_module,
        "get_settings",
        lambda: Settings(translation_sdk_base_url=sdk_base, base_url=api_base),
    )
    with pytest.raises(ConfigurationError, match="TRANSLATION_SDK_BASE_URL"):
        await onboarding_service.update_website(
            website.id, TENANT, {"name": "Changed", "domain": "changed.com", "status": "Inactive"}
        )

    assert await WebsiteRepository(mock_db).find_by_id_and_tenant(website.id, TENANT) == before


async def test_update_website_checks_config_before_anything_else(onboarding_service, monkeypatch):
    from app.platform.error_handling import ConfigurationError
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    monkeypatch.setattr(onboarding_service_module, "get_settings", lambda: Settings())

    with pytest.raises(ConfigurationError):
        await onboarding_service.update_website("000000000000000000000000", TENANT, {"name": "x"})


async def test_update_website_still_reports_unknown_ids_and_bad_domains_with_valid_config(onboarding_service):
    with pytest.raises(NotFoundError):
        await onboarding_service.update_website("000000000000000000000000", TENANT, {"name": "x"})

    website = await onboarding_service.register_website(TENANT, None, "acme.com")
    with pytest.raises(ValidationError):
        await onboarding_service.update_website(website.id, TENANT, {"domain": "not a domain"})


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
