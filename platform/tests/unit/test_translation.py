"""Unit tests for translation provider factory, repository, and service.

Uses the mongomock-based async shim for repository/service tests and a fake
TranslationProvider for service tests — no real MongoDB or AI vendor calls.
"""

from __future__ import annotations

import pytest

from app.platform.error_handling import NotFoundError
from app.platform.settings import Settings
from app.providers.translation_provider import (
    GroqTranslationProvider,
    OpenAITranslationProvider,
    TransientTranslationError,
    TranslationProvider,
    get_translation_provider,
)
from app.repositories.translation_repository import TranslationRepository
from app.services.placeholder_protector import mask, unmask
from app.services.translation_service import TranslationService
from tests.support.mongomock_async import AsyncMongoMockClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


@pytest.fixture
def translation_repo(mock_db):
    return TranslationRepository(mock_db)


class _FakeProvider(TranslationProvider):
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str]] = []

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        self.calls.append((text, source_lang, target_lang))
        return f"[{target_lang}] {text}"


@pytest.fixture
def fake_provider():
    return _FakeProvider()


@pytest.fixture
def translation_service(mock_db, fake_provider):
    return TranslationService(mock_db, fake_provider)


# ---------------------------------------------------------------------------
# Provider factory
# ---------------------------------------------------------------------------


def test_get_translation_provider_defaults_to_openai():
    settings = Settings(translation_provider="openai", openai_api_key="sk-test")
    provider = get_translation_provider(settings)
    assert isinstance(provider, OpenAITranslationProvider)


def test_get_translation_provider_rejects_unknown_vendor():
    settings = Settings(translation_provider="unknown-vendor", openai_api_key="sk-test")
    with pytest.raises(ValueError, match="Unsupported translation_provider"):
        get_translation_provider(settings)


def test_openai_provider_requires_api_key():
    with pytest.raises(ValueError):
        OpenAITranslationProvider("")


def test_get_translation_provider_selects_groq():
    settings = Settings(translation_provider="groq", groq_api_key="gsk-test")
    provider = get_translation_provider(settings)
    assert isinstance(provider, GroqTranslationProvider)


def test_groq_provider_requires_api_key():
    with pytest.raises(ValueError):
        GroqTranslationProvider("", "llama-3.3-70b-versatile")


# ---------------------------------------------------------------------------
# Groq fallback behavior
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, status: int, text: str = "", json_body: dict | None = None) -> None:
        self.status = status
        self._text = text
        self._json_body = json_body or {}

    async def text(self) -> str:
        return self._text

    async def json(self) -> dict:
        return self._json_body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


class _FakeSession:
    def __init__(self, response: _FakeResponse) -> None:
        self._response = response

    def post(self, *args, **kwargs):
        return self._response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


@pytest.mark.asyncio
async def test_groq_raises_transient_on_5xx(monkeypatch):
    import aiohttp

    import app.providers.translation_provider as tp

    monkeypatch.setattr(tp, "_BASE_BACKOFF_SECONDS", 0)  # no real sleeping in tests
    provider = GroqTranslationProvider("gsk-test", "llama-3.3-70b-versatile")
    response = _FakeResponse(status=503, text="service unavailable")
    monkeypatch.setattr(aiohttp, "ClientSession", lambda: _FakeSession(response))

    # Never fabricate a placeholder: a persistent transient failure is raised so
    # the caller skips the item instead of persisting "[hi] Hello".
    with pytest.raises(TransientTranslationError):
        await provider.translate("Hello", "en", "hi")


@pytest.mark.asyncio
async def test_groq_raises_transient_on_429(monkeypatch):
    import aiohttp

    import app.providers.translation_provider as tp

    monkeypatch.setattr(tp, "_BASE_BACKOFF_SECONDS", 0)
    provider = GroqTranslationProvider("gsk-test", "llama-3.3-70b-versatile")
    response = _FakeResponse(status=429, text="rate limited")
    monkeypatch.setattr(aiohttp, "ClientSession", lambda: _FakeSession(response))

    with pytest.raises(TransientTranslationError):
        await provider.translate("Hello", "en", "hi")


@pytest.mark.asyncio
async def test_groq_surfaces_auth_error_instead_of_fallback(monkeypatch):
    import aiohttp

    provider = GroqTranslationProvider("gsk-bad", "llama-3.3-70b-versatile")
    response = _FakeResponse(status=401, text="invalid api key")
    monkeypatch.setattr(aiohttp, "ClientSession", lambda: _FakeSession(response))

    with pytest.raises(RuntimeError, match="Groq translation error 401"):
        await provider.translate("Hello", "en", "hi")


@pytest.mark.asyncio
async def test_groq_surfaces_config_error_instead_of_fallback(monkeypatch):
    import aiohttp

    provider = GroqTranslationProvider("gsk-test", "nonexistent-model")
    response = _FakeResponse(status=422, text="unknown model")
    monkeypatch.setattr(aiohttp, "ClientSession", lambda: _FakeSession(response))

    with pytest.raises(RuntimeError, match="Groq translation error 422"):
        await provider.translate("Hello", "en", "hi")


# ---------------------------------------------------------------------------
# Placeholder protector
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Hello {name}, welcome!",
        "Hello {{name}}, you have %s new messages",
        "Click <a href='/x'>here</a> to continue",
        "See [our docs](https://example.com) for more",
        "![logo](https://example.com/logo.png)",
        "No placeholders at all",
        "",
    ],
)
def test_mask_unmask_round_trip(text):
    masked, mapping = mask(text)
    assert unmask(masked, mapping) == text


def test_mask_replaces_placeholders_with_tokens():
    masked, mapping = mask("Hello {name}!")
    assert "{name}" not in masked
    assert len(mapping) == 1


def test_mask_is_noop_for_plain_text():
    masked, mapping = mask("Namaste")
    assert masked == "Namaste"
    assert mapping == {}


# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------


async def test_upsert_source_is_idempotent(translation_repo):
    await translation_repo.upsert_source("site1", "/home", "t1", "en", "Hello")
    await translation_repo.upsert_source("site1", "/home", "t1", "en", "Hello again")

    docs = await translation_repo.find_by_route("site1", "/home")
    assert len(docs) == 1
    assert docs[0]["sourceText"] == "Hello"


async def test_save_translation_then_find_by_keys(translation_repo):
    await translation_repo.upsert_source("site1", "/home", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/home", "t1", "hi", "Namaste", "OpenAITranslationProvider")

    docs = await translation_repo.find_by_keys("site1", ["t1"])
    assert len(docs) == 1
    assert docs[0]["translations"]["hi"]["text"] == "Namaste"
    assert docs[0]["translations"]["hi"]["provider"] == "OpenAITranslationProvider"


async def test_save_translation_does_not_cross_route_when_keys_collide(translation_repo):
    """A content-hash key can collide across routes; save must only touch its own route's doc."""
    await translation_repo.upsert_source("site1", "/", "shared-key", "en", "Login")
    await translation_repo.upsert_source("site1", "/register", "shared-key", "en", "Login")

    await translation_repo.save_translation("site1", "/", "shared-key", "hi", "Home Login", "OpenAITranslationProvider")

    home_doc = (await translation_repo.find_by_route("site1", "/"))[0]
    register_doc = (await translation_repo.find_by_route("site1", "/register"))[0]

    assert home_doc["translations"]["hi"]["text"] == "Home Login"
    assert register_doc["translations"] == {}


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


async def test_extract_items_upserts_source(translation_service, translation_repo):
    await translation_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
    )
    docs = await translation_repo.find_by_route("site1", "/home")
    assert len(docs) == 1
    assert docs[0]["sourceText"] == "Hello"


async def test_get_or_translate_calls_provider_once_then_reuses(
    translation_repo, translation_service, fake_provider
):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.approve_translation(translation_id, "reviewer@example.com")

    first = await translation_service.get_or_translate("site1", "/home", "hi")
    assert first == {"t1": "[hi] Hello"}
    assert len(fake_provider.calls) == 1

    second = await translation_service.get_or_translate("site1", "/home", "hi")
    assert second == {"t1": "[hi] Hello"}
    assert len(fake_provider.calls) == 1  # no duplicate AI call


# ---------------------------------------------------------------------------
# Human review workflow
# ---------------------------------------------------------------------------


async def _seeded_translation_id(translation_repo, translation_service):
    await translation_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
    )
    docs = await translation_repo.find_by_route("site1", "/home")
    return str(docs[0]["_id"])


async def test_get_translation_returns_doc(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)

    doc = await translation_service.get_translation(translation_id)
    assert doc["sourceText"] == "Hello"


async def test_get_translation_raises_not_found_for_unknown_id():
    from tests.support.mongomock_async import AsyncMongoMockClient

    db = AsyncMongoMockClient()["test_seeds"]
    from app.providers.translation_provider import TranslationProvider

    class _NoopProvider(TranslationProvider):
        async def translate(self, text, source_lang, target_lang):  # noqa: D102
            raise AssertionError("should not be called")

    service = TranslationService(db, _NoopProvider())
    with pytest.raises(NotFoundError):
        await service.get_translation("000000000000000000000000")


async def test_update_translation_sets_edited_text(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_repo.save_translation("site1", "/home", "t1", "hi", "Namaste", "OpenAITranslationProvider")

    doc = await translation_service.update_translation(translation_id, "hi", "Namaste (edited)")
    assert doc["translations"]["hi"]["text"] == "Namaste (edited)"


async def test_approve_translation_sets_reviewer_metadata(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)

    doc = await translation_service.approve_translation(translation_id, "reviewer@example.com")
    assert doc["status"] == "approved"
    assert doc["approvedBy"] == "reviewer@example.com"
    assert doc["approvedAt"] is not None


async def test_approve_translation_raises_not_found_for_unknown_id(translation_service):
    with pytest.raises(NotFoundError):
        await translation_service.approve_translation("000000000000000000000000", "reviewer@example.com")


# ---------------------------------------------------------------------------
# Runtime delivery — auto-approve (any available translation is served)
# ---------------------------------------------------------------------------


async def test_get_or_translate_returns_translated_text_when_approved(
    translation_repo, translation_service
):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")  # generate + store
    await translation_service.approve_translation(translation_id, "reviewer@example.com")

    result = await translation_service.get_or_translate("site1", "/home", "hi")
    assert result == {"t1": "[hi] Hello"}


async def test_get_or_translate_serves_translation_even_when_draft(
    translation_repo, translation_service
):
    # Auto-approve: a freshly generated (unapproved) translation is served so
    # newly-added pages render immediately without a manual review step.
    await _seeded_translation_id(translation_repo, translation_service)

    result = await translation_service.get_or_translate("site1", "/home", "hi")
    assert result == {"t1": "[hi] Hello"}


async def test_get_or_translate_generates_and_serves_missing_translation(
    translation_repo, translation_service, fake_provider
):
    await _seeded_translation_id(translation_repo, translation_service)

    result = await translation_service.get_or_translate("site1", "/home", "hi")
    assert result == {"t1": "[hi] Hello"}
    assert len(fake_provider.calls) == 1


async def test_get_stored_translations_reads_only_never_calls_provider(
    translation_repo, translation_service, fake_provider
):
    # Runtime read path: one item has a stored translation, one does not. The
    # stored one is returned; the missing one falls back to source text. The AI
    # provider is NEVER called inline (that would stall/502 an uncovered route).
    await translation_service.extract_items(
        "site1",
        [
            {"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"},
            {"key": "t2", "text": "World", "route": "/home", "sourceLang": "en"},
        ],
    )
    await translation_repo.save_translation(
        "site1", "/home", "t1", "hi", "Namaste", "GroqTranslationProvider"
    )

    result = await translation_service.get_stored_translations("site1", "/home", "hi")

    assert result == {"t1": "Namaste", "t2": "World"}  # stored + source fallback
    assert len(fake_provider.calls) == 0  # no inline AI


async def test_get_or_translate_skips_item_on_transient_failure(
    translation_repo, translation_service, monkeypatch
):
    # A transient provider failure must not poison the DB with a placeholder:
    # the item is skipped (source text returned) and nothing is persisted.
    await _seeded_translation_id(translation_repo, translation_service)

    async def _boom(*args, **kwargs):
        raise TransientTranslationError("429 rate limited")

    monkeypatch.setattr(translation_service._provider, "translate", _boom)

    result = await translation_service.get_or_translate("site1", "/home", "hi")
    assert result == {"t1": "Hello"}  # source fallback, not "[hi] Hello"

    docs = await translation_repo.find_by_route("site1", "/home")
    assert docs[0].get("translations", {}) == {}  # nothing persisted


async def test_get_or_translate_reuses_existing_translation_no_duplicate_ai_call(
    translation_repo, translation_service, fake_provider
):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.approve_translation(translation_id, "reviewer@example.com")

    first = await translation_service.get_or_translate("site1", "/home", "hi")
    second = await translation_service.get_or_translate("site1", "/home", "hi")

    assert first == second == {"t1": "[hi] Hello"}
    assert len(fake_provider.calls) == 1


# ---------------------------------------------------------------------------
# Translation Memory — exact match reuse, approved-only
# ---------------------------------------------------------------------------


async def test_translation_memory_reuses_approved_exact_match_no_ai_call(
    translation_repo, translation_service, fake_provider
):
    # site1/t1 gets an approved "Hello" -> "[hi] Hello".
    id1 = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(id1, "reviewer@example.com")
    assert len(fake_provider.calls) == 1

    # site2/t2 has identical source text "Hello" on a different route/site.
    await translation_service.extract_items(
        "site2", [{"key": "t2", "text": "Hello", "route": "/about", "sourceLang": "en"}]
    )

    # site2/t2 is served immediately (auto-approve) — and the stored translation
    # came from TM, not a second AI call.
    result = await translation_service.get_or_translate("site2", "/about", "hi")
    assert result == {"t2": "[hi] Hello"}
    assert len(fake_provider.calls) == 1  # TM reuse, no second AI call

    docs = await translation_repo.find_by_route("site2", "/about")
    assert docs[0]["translations"]["hi"]["text"] == "[hi] Hello"
    assert docs[0]["translations"]["hi"]["provider"] == "TranslationMemory"


async def test_translation_memory_no_match_falls_through_to_ai_call(
    translation_repo, translation_service, fake_provider
):
    await translation_service.extract_items(
        "site1", [{"key": "t1", "text": "Unique phrase", "route": "/home", "sourceLang": "en"}]
    )

    result = await translation_service.get_or_translate("site1", "/home", "hi")

    assert result == {"t1": "[hi] Unique phrase"}  # auto-approve: AI draft served
    assert len(fake_provider.calls) == 1  # AI called to generate the draft


async def test_translation_memory_does_not_reuse_unapproved_translation(
    translation_repo, translation_service, fake_provider
):
    # site1/t1 gets a translation but is never approved.
    await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    assert len(fake_provider.calls) == 1

    # site2/t2 has identical source text but the only prior translation is a draft.
    await translation_service.extract_items(
        "site2", [{"key": "t2", "text": "Hello", "route": "/about", "sourceLang": "en"}]
    )

    await translation_service.get_or_translate("site2", "/about", "hi")

    assert len(fake_provider.calls) == 2  # TM skipped drafts, AI called again


# ---------------------------------------------------------------------------
# Glossary — applied before Translation Memory / AI
# ---------------------------------------------------------------------------


async def test_get_analytics_counts_across_pending_approved_ai_and_tm(translation_repo, translation_service):
    # site1/t1: AI-generated, then approved.
    id1 = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(id1, "reviewer@example.com")

    # site1/t2: AI-generated, left pending (never approved).
    await translation_service.extract_items(
        "site1", [{"key": "t2", "text": "Goodbye", "route": "/bye", "sourceLang": "en"}]
    )
    await translation_service.get_or_translate("site1", "/bye", "hi")

    # site2/t3: identical source text as t1 -> reused from Translation Memory.
    await translation_service.extract_items(
        "site2", [{"key": "t3", "text": "Hello", "route": "/about", "sourceLang": "en"}]
    )
    await translation_service.get_or_translate("site2", "/about", "hi")

    analytics = await translation_repo.get_analytics()
    assert analytics == {
        "totalTranslations": 3,
        "approvedTranslations": 1,
        "pendingTranslations": 2,
        "aiGeneratedTranslations": 2,
        "translationMemoryReusedTranslations": 1,
    }


async def test_get_analytics_filters_by_site_id(translation_repo, translation_service):
    await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.extract_items(
        "site2", [{"key": "t2", "text": "Bonjour", "route": "/home", "sourceLang": "en"}]
    )

    site1_analytics = await translation_repo.get_analytics("site1")
    site2_analytics = await translation_repo.get_analytics("site2")

    assert site1_analytics["totalTranslations"] == 1
    assert site2_analytics["totalTranslations"] == 1


async def test_analytics_service_summary_includes_project_and_site_counts(mock_db, translation_repo, translation_service):
    from app.services.analytics_service import AnalyticsService
    from app.services.onboarding_service import OnboardingService

    onboarding = OnboardingService(mock_db)
    project = await onboarding.create_project("Acme Corp")
    await onboarding.register_website(str(project["_id"]), "acme.com")
    await onboarding.register_website(str(project["_id"]), "widgets.acme.com")

    await _seeded_translation_id(translation_repo, translation_service)

    summary = await AnalyticsService(mock_db).get_summary()
    assert summary["totalProjects"] == 1
    assert summary["totalSites"] == 2
    assert summary["totalTranslations"] == 1


async def test_glossary_term_replaced_before_ai_call(mock_db, translation_repo, translation_service, fake_provider):
    from app.repositories.glossary_repository import GlossaryRepository

    await GlossaryRepository(mock_db).add_term("Hello", "hi", "Namaste")
    await _seeded_translation_id(translation_repo, translation_service)

    await translation_service.get_or_translate("site1", "/home", "hi")

    assert fake_provider.calls == [("Namaste", "en", "hi")]


# ---------------------------------------------------------------------------
# Quality score — origin-based, never a fabricated AI confidence
# ---------------------------------------------------------------------------


async def test_fresh_ai_translation_has_heuristic_quality_score(translation_repo, translation_service):
    await _seeded_translation_id(translation_repo, translation_service)

    await translation_service.get_or_translate("site1", "/home", "hi")

    docs = await translation_repo.find_by_route("site1", "/home")
    quality_score = docs[0]["translations"]["hi"]["qualityScore"]
    assert isinstance(quality_score, float)
    assert 0.0 <= quality_score <= 1.0
    assert docs[0]["translations"]["hi"]["provider"] == "_FakeProvider"


async def test_translation_memory_reuse_has_quality_score_one(translation_repo, translation_service):
    id1 = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(id1, "reviewer@example.com")

    await translation_service.extract_items(
        "site2", [{"key": "t2", "text": "Hello", "route": "/about", "sourceLang": "en"}]
    )
    await translation_service.get_or_translate("site2", "/about", "hi")

    docs = await translation_repo.find_by_route("site2", "/about")
    assert docs[0]["translations"]["hi"]["qualityScore"] == 1.0
    assert docs[0]["translations"]["hi"]["provider"] == "TranslationMemory"


async def test_approve_translation_records_version_one(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")

    doc = await translation_service.approve_translation(translation_id, "reviewer@example.com")

    assert doc["version"] == 1
    history = await translation_service.get_version_history(translation_id)
    assert len(history) == 1
    assert history[0]["version"] == 1
    assert history[0]["approvedBy"] == "reviewer@example.com"
    assert history[0]["translations"]["hi"]["text"] == "[hi] Hello"


async def test_versions_endpoint_admin_access(translation_repo, translation_service):
    from app.controllers.translation_controller import get_version_history
    from app.platform.auth.dependencies import require_admin_or_reviewer

    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "reviewer@example.com")

    user = await require_admin_or_reviewer(user={"sub": "u1", "role": "admin"})
    history = await get_version_history(translation_id, service=translation_service, user=user)

    assert len(history) == 1
    assert history[0]["version"] == 1


async def test_versions_endpoint_reviewer_access(translation_repo, translation_service):
    from app.controllers.translation_controller import get_version_history
    from app.platform.auth.dependencies import require_admin_or_reviewer

    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "reviewer@example.com")

    user = await require_admin_or_reviewer(user={"sub": "u1", "role": "reviewer"})
    history = await get_version_history(translation_id, service=translation_service, user=user)

    assert len(history) == 1
    assert history[0]["version"] == 1


async def test_versions_endpoint_unauthorized_access(translation_repo, translation_service):
    from app.platform.auth.dependencies import require_admin_or_reviewer
    from app.platform.error_handling import ForbiddenError

    with pytest.raises(ForbiddenError):
        await require_admin_or_reviewer(user={"sub": "u1", "role": "teacher"})


async def test_reapproval_appends_new_version_without_touching_history(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "reviewer1@example.com")

    await translation_service.update_translation(translation_id, "hi", "Namaste (edited)")
    doc = await translation_service.approve_translation(translation_id, "reviewer2@example.com")

    assert doc["version"] == 2
    history = await translation_service.get_version_history(translation_id)
    assert [v["version"] for v in history] == [1, 2]
    assert history[0]["translations"]["hi"]["text"] == "[hi] Hello"  # first snapshot untouched
    assert history[1]["translations"]["hi"]["text"] == "Namaste (edited)"
    assert history[0]["approvedBy"] == "reviewer1@example.com"
    assert history[1]["approvedBy"] == "reviewer2@example.com"


async def test_quality_score_survives_approval_unchanged(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")

    doc = await translation_service.get_translation(translation_id)
    pre_approval_score = doc["translations"]["hi"]["qualityScore"]
    assert isinstance(pre_approval_score, float)  # honest heuristic, visible before approval

    approved_doc = await translation_service.approve_translation(translation_id, "reviewer@example.com")
    assert approved_doc["translations"]["hi"]["qualityScore"] == pre_approval_score


async def test_glossary_no_matching_terms_leaves_text_unchanged(
    mock_db, translation_repo, translation_service, fake_provider
):
    from app.repositories.glossary_repository import GlossaryRepository

    await GlossaryRepository(mock_db).add_term("Goodbye", "hi", "Alvida")
    await _seeded_translation_id(translation_repo, translation_service)

    await translation_service.get_or_translate("site1", "/home", "hi")

    assert fake_provider.calls == [("Hello", "en", "hi")]


async def test_glossary_replacement_is_whole_word_only(mock_db, translation_repo, translation_service, fake_provider):
    from app.repositories.glossary_repository import GlossaryRepository

    await GlossaryRepository(mock_db).add_term("Hell", "hi", "XXX")
    await _seeded_translation_id(translation_repo, translation_service)

    await translation_service.get_or_translate("site1", "/home", "hi")

    assert fake_provider.calls == [("Hello", "en", "hi")]  # "Hell" is not a whole-word match in "Hello"


async def test_glossary_replacement_is_case_insensitive(mock_db, translation_repo, translation_service, fake_provider):
    from app.repositories.glossary_repository import GlossaryRepository

    await GlossaryRepository(mock_db).add_term("hello", "hi", "Namaste")
    await _seeded_translation_id(translation_repo, translation_service)

    await translation_service.get_or_translate("site1", "/home", "hi")

    assert fake_provider.calls == [("Namaste", "en", "hi")]


# ---------------------------------------------------------------------------
# Audit trail — who translated / edited / approved / rejected, and when
# ---------------------------------------------------------------------------


async def test_translation_creation_is_audited(mock_db, translation_repo, translation_service):
    await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")

    # Sub-document records the machine translator identity.
    doc = (await translation_repo.find_by_route("site1", "/home"))[0]
    assert doc["translations"]["hi"]["createdBy"] == "system:_FakeProvider"

    # Embedded per-document auditLog has a creation event.
    actions = {e["action"] for e in doc.get("auditLog", [])}
    assert "translated" in actions

    # Append-only collection has a matching event.
    entries = await mock_db["translation_audit"].find(
        {"siteId": "site1", "route": "/home", "action": "translated"}
    ).to_list(length=None)
    assert len(entries) == 1
    assert entries[0]["actor"] == "system:_FakeProvider"
    assert entries[0]["lang"] == "hi"
    assert entries[0]["provider"] == "_FakeProvider"


async def test_approve_and_reject_are_audited_in_collection(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "reviewer@example.com")

    trail = await translation_service.get_audit_trail("site1", route="/home", key="t1")
    actions = [e["action"] for e in trail]
    assert "approved" in actions
    approved = next(e for e in trail if e["action"] == "approved")
    assert approved["actor"] == "reviewer@example.com"


async def test_get_audit_trail_is_newest_first(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")  # translated
    await translation_service.approve_translation(translation_id, "reviewer@example.com")  # approved

    trail = await translation_service.get_audit_trail("site1", route="/home", key="t1")
    assert [e["action"] for e in trail][:2] == ["approved", "translated"]


# ---------------------------------------------------------------------------
# Runtime on-demand translation (inject SDK anywhere -> translate any language)
# ---------------------------------------------------------------------------


async def test_runtime_translate_generates_missing_on_demand(
    translation_repo, translation_service
):
    await translation_service.extract_items("site1", [
        {"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"},
        {"key": "t2", "text": "World", "route": "/h", "sourceLang": "en"},
    ])
    result = await translation_service.runtime_translate("site1", "/h", "hi")
    assert result == {"t1": "[hi] Hello", "t2": "[hi] World"}

    docs = await translation_repo.find_by_route("site1", "/h")
    assert all(d["translations"]["hi"]["text"].startswith("[hi]") for d in docs)

    trail = await translation_service.get_audit_trail("site1", route="/h", key="t1")
    assert "translated" in [e["action"] for e in trail]


async def test_runtime_translate_reuses_existing_no_regenerate(
    translation_repo, translation_service, fake_provider
):
    await translation_service.extract_items("site1", [
        {"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"},
    ])
    await translation_service.runtime_translate("site1", "/h", "hi")
    assert len(fake_provider.calls) == 1
    await translation_service.runtime_translate("site1", "/h", "hi")
    assert len(fake_provider.calls) == 1  # existing reused, no second call


async def test_runtime_translate_falls_back_to_source_on_transient(
    translation_repo, translation_service, monkeypatch
):
    await translation_service.extract_items("site1", [
        {"key": "t1", "text": "Hi", "route": "/h", "sourceLang": "en"},
    ])

    async def boom(*a, **k):
        raise TransientTranslationError("429")

    monkeypatch.setattr(translation_service._provider, "translate_batch", boom)
    monkeypatch.setattr(translation_service._provider, "translate", boom)

    result = await translation_service.runtime_translate("site1", "/h", "hi")
    assert result == {"t1": "Hi"}  # source fallback, nothing persisted
    docs = await translation_repo.find_by_route("site1", "/h")
    assert docs[0].get("translations", {}) == {}


# ---------------------------------------------------------------------------
# Quality score + low-confidence flagging (ticket #436, AC6)
# ---------------------------------------------------------------------------


def test_score_translation_is_bounded_and_penalises_dropped_placeholder():
    from app.services.quality_scorer import score_translation

    pmap = {"__PH0__": "<b>"}
    survived = score_translation("Hi __PH0__", "Bonjour __PH0__", pmap)
    dropped = score_translation("Hi __PH0__", "Bonjour", pmap)

    assert 0.0 <= dropped <= survived <= 1.0
    assert dropped < survived  # losing a placeholder must lower confidence
    assert score_translation("anything", "", {}) == 0.0  # empty output => 0


def test_is_low_confidence_default_and_custom_threshold():
    from app.services.quality_scorer import is_low_confidence

    assert is_low_confidence(0.5) is True          # below default 0.7
    assert is_low_confidence(0.9) is False          # above default 0.7
    assert is_low_confidence(None) is False         # no score => not flagged
    # configurable threshold
    assert is_low_confidence(0.8, threshold=0.85) is True
    assert is_low_confidence(0.8, threshold=0.75) is False


def test_translation_response_exposes_low_confidence_flag():
    from app.models.responses.translation import TranslationResponse

    doc = {
        "_id": "abc",
        "siteId": "s1",
        "route": "/",
        "key": "t1",
        "sourceText": "Hello",
        "translations": {
            "hi": {"text": "x", "qualityScore": 0.4},   # low
            "ta": {"text": "y", "qualityScore": 0.95},  # ok
        },
    }
    out = TranslationResponse.from_doc(doc)

    assert out["translations"]["hi"]["lowConfidence"] is True
    assert out["translations"]["ta"]["lowConfidence"] is False
    assert out["lowConfidence"] is True  # doc-level: any language low


def test_translation_response_low_confidence_false_when_all_ok():
    from app.models.responses.translation import TranslationResponse

    doc = {
        "_id": "abc", "siteId": "s1", "route": "/", "key": "t1", "sourceText": "Hi",
        "translations": {"hi": {"text": "x", "qualityScore": 0.95}},
    }
    out = TranslationResponse.from_doc(doc)
    assert out["translations"]["hi"]["lowConfidence"] is False
    assert out["lowConfidence"] is False


async def test_list_translations_low_confidence_only_filters(translation_repo, translation_service):
    await translation_service.extract_items("s1", [
        {"key": "low", "text": "A", "route": "/r", "sourceLang": "en"},
        {"key": "ok", "text": "B", "route": "/r", "sourceLang": "en"},
    ])
    await translation_repo.save_translation("s1", "/r", "low", "hi", "x", "AI", quality_score=0.4)
    await translation_repo.save_translation("s1", "/r", "ok", "hi", "y", "AI", quality_score=0.95)

    flagged = await translation_service.list_translations("s1", route="/r", low_confidence_only=True)
    assert [d["key"] for d in flagged] == ["low"]

    everything = await translation_service.list_translations("s1", route="/r")
    assert {d["key"] for d in everything} == {"low", "ok"}
