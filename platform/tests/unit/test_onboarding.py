
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


async def test_snippet_format(onboarding_service, monkeypatch):
    from app.platform.settings import Settings
    from app.services import onboarding_service as onboarding_service_module

    monkeypatch.setattr(
        onboarding_service_module,
        "get_settings",
        lambda: Settings(translation_sdk_base_url="https://proxy.example.com"),
    )

    project = await onboarding_service.create_project("Acme Corp")
    website = await onboarding_service.register_website(project.id, "acme.com")
    snippet = website.snippet

    assert 'src="https://proxy.example.com/sdk.js"' in snippet
    assert f'data-site-id="{website.site_id}"' in snippet
    assert 'data-api-base="https://proxy.example.com"' in snippet
    assert "defer" in snippet


def test_build_snippet_exact_format():
    snippet = build_snippet("https://proxy.example.com", "abc-123")
    assert snippet == (
        "<script\n"
        '  src="https://proxy.example.com/sdk.js"\n'
        '  data-site-id="abc-123"\n'
        '  data-api-base="https://proxy.example.com"\n'
        "  defer>\n"
        "</script>"
    )


async def test_get_website_raises_not_found_for_unknown_id(onboarding_service):
    with pytest.raises(NotFoundError):
        await onboarding_service.get_website("000000000000000000000000")


async def test_website_indexes_are_unique(mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)
    repo = WebsiteRepository(mock_db)
    await repo.create("p1", "acme.com", "site-1")
    with pytest.raises(DuplicateKeyError):
        await repo.create("p1", "acme.com", "site-2")
