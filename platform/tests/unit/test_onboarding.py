
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


@pytest.fixture(autouse=True)
def snippet_settings(monkeypatch):
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    monkeypatch.setattr(
        onboarding_service_module,
        "get_settings",
        lambda: Settings(translation_sdk_base_url=SDK_BASE, translation_api_base_url=API_BASE),
    )


@pytest.fixture
async def onboarding_service(mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)
    return OnboardingService(mock_db)


async def test_create_project(onboarding_service):
    project = await onboarding_service.create_project("Acme Corp")
    assert project.name == "Acme Corp"


async def test_register_website_generates_uuid_site_id(onboarding_service):
    project = await onboarding_service.create_project("Acme Corp")
    website = await onboarding_service.register_website(project.id, "acme.com")

    assert website.domain == "acme.com"
    assert website.project_id == project.id
    assert len(website.site_id) == 36


async def test_register_website_raises_not_found_for_unknown_project(onboarding_service):
    with pytest.raises(NotFoundError):
        await onboarding_service.register_website("000000000000000000000000", "acme.com")


async def test_register_website_rejects_invalid_domain(onboarding_service):
    project = await onboarding_service.create_project("Acme Corp")
    with pytest.raises(ValidationError):
        await onboarding_service.register_website(project.id, "not a domain")


async def test_register_website_rejects_duplicate_domain(onboarding_service):
    project = await onboarding_service.create_project("Acme Corp")
    await onboarding_service.register_website(project.id, "acme.com")
    with pytest.raises(ConflictError):
        await onboarding_service.register_website(project.id, "acme.com")


async def test_snippet_format(onboarding_service):
    project = await onboarding_service.create_project("Acme Corp")
    website = await onboarding_service.register_website(project.id, "acme.com")
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
        lambda: Settings(translation_sdk_base_url="https://sdk.example.com/", translation_api_base_url="https://api.example.com/"),
    )
    website = await onboarding_service.register_website(None, "acme.com")

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
        lambda: Settings(translation_sdk_base_url=sdk_base, translation_api_base_url=api_base),
    )

    with pytest.raises(ConfigurationError, match="TRANSLATION_SDK_BASE_URL"):
        await onboarding_service.register_website(None, "acme.com")

    assert await mock_db["websites"].count_documents({}) == 0


async def test_register_website_without_a_project(onboarding_service):
    website = await onboarding_service.register_website(None, "acme.com")

    assert website.project_id is None
    assert website.domain == "acme.com"
    assert len(website.site_id) == 36


async def test_website_create_request_project_id_is_optional():
    from app.models.requests.onboarding_requests import WebsiteCreateRequest

    assert WebsiteCreateRequest(domain="acme.com").project_id is None


def test_backend_no_longer_serves_a_second_copy_of_the_sdk():
    from app.router import api_router

    assert "/sdk.js" not in {route.path for route in api_router.routes}


async def test_update_website_updates_fields_and_returns_a_snippet(onboarding_service):
    website = await onboarding_service.register_website(None, "acme.com", name="Acme")

    updated = await onboarding_service.update_website(website.id, {"name": "Renamed", "status": "Inactive"})

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

    website = await onboarding_service.register_website(None, "acme.com", name="Acme")
    before = await WebsiteRepository(mock_db).find_by_id(website.id)

    monkeypatch.setattr(
        onboarding_service_module,
        "get_settings",
        lambda: Settings(translation_sdk_base_url=sdk_base, translation_api_base_url=api_base),
    )
    with pytest.raises(ConfigurationError, match="TRANSLATION_SDK_BASE_URL"):
        await onboarding_service.update_website(
            website.id, {"name": "Changed", "domain": "changed.com", "status": "Inactive"}
        )

    assert await WebsiteRepository(mock_db).find_by_id(website.id) == before


async def test_update_website_checks_config_before_anything_else(onboarding_service, monkeypatch):
    from app.platform.error_handling import ConfigurationError
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    monkeypatch.setattr(onboarding_service_module, "get_settings", lambda: Settings())

    with pytest.raises(ConfigurationError):
        await onboarding_service.update_website("000000000000000000000000", {"name": "x"})


async def test_update_website_still_reports_unknown_ids_and_bad_domains_with_valid_config(onboarding_service):
    with pytest.raises(NotFoundError):
        await onboarding_service.update_website("000000000000000000000000", {"name": "x"})

    website = await onboarding_service.register_website(None, "acme.com")
    with pytest.raises(ValidationError):
        await onboarding_service.update_website(website.id, {"domain": "not a domain"})


async def test_find_by_domain(mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)
    repo = WebsiteRepository(mock_db)
    await repo.create(None, "acme.com", "site-1")

    assert (await repo.find_by_domain("acme.com"))["site_id"] == "site-1"
    assert await repo.find_by_domain("other.com") is None


async def test_get_website_raises_not_found_for_unknown_id(onboarding_service):
    with pytest.raises(NotFoundError):
        await onboarding_service.get_website("000000000000000000000000")


async def test_website_indexes_are_unique(mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)
    repo = WebsiteRepository(mock_db)
    await repo.create("p1", "acme.com", "site-1")
    with pytest.raises(DuplicateKeyError):
        await repo.create("p1", "acme.com", "site-2")
