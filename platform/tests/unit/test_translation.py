"""Unit tests for translation provider factory, repository, and service.

Uses the mongomock-based async shim for repository/service tests and a fake
TranslationProvider for service tests — no real MongoDB or AI vendor calls.
"""

from __future__ import annotations

import pytest

import app.services.translation_service as ts_module
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
async def translation_service(mock_db, fake_provider):
    await mock_db["websites"].insert_many(
        [
            {"siteId": "site1", "status": "Active"},
            {"siteId": "site2", "status": "Active"},
            {"siteId": "s1", "status": "Active"},
        ]
    )
    # Origin binding and lang validation are exercised by their own dedicated
    # tests below with real domain/language fixtures; disabled here so the
    # rest of the suite doesn't need to seed them for unrelated behavior.
    return TranslationService(
        mock_db, lambda: fake_provider, enforce_origin_check=False, enforce_lang_validation=False
    )


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

    first = await translation_service.get_or_translate("site1", "/home", "hi")
    assert first == {"t1": "Hello"}  # pending -> source fallback
    assert len(fake_provider.calls) == 1

    await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")

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

    service = TranslationService(db, _NoopProvider)
    with pytest.raises(NotFoundError):
        await service.get_translation("000000000000000000000000")


async def test_update_translation_sets_edited_text(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_repo.save_translation("site1", "/home", "t1", "hi", "Namaste", "OpenAITranslationProvider")

    doc = await translation_service.update_translation(translation_id, "hi", "Namaste (edited)")
    assert doc["translations"]["hi"]["text"] == "Namaste (edited)"


async def test_approve_translation_sets_reviewer_metadata(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)

    doc = await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")
    assert doc["status"] == "approved"
    assert doc["approvedBy"] == "reviewer@example.com"
    assert doc["approvedAt"] is not None


async def test_approve_translation_raises_not_found_for_unknown_id(translation_service):
    with pytest.raises(NotFoundError):
        await translation_service.approve_translation("000000000000000000000000", "hi", "reviewer@example.com")


# ---------------------------------------------------------------------------
# Runtime delivery — auto-approve (any available translation is served)
# ---------------------------------------------------------------------------


async def test_get_or_translate_returns_translated_text_when_approved(
    translation_repo, translation_service
):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")  # generate + store
    await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")

    result = await translation_service.get_or_translate("site1", "/home", "hi")
    assert result == {"t1": "[hi] Hello"}


async def test_get_or_translate_falls_back_to_source_when_draft(
    translation_repo, translation_service
):
    # Approval gate: a freshly generated (unapproved) translation is persisted
    # as a draft but NOT served — the caller gets source text until a human
    # approves the document.
    await _seeded_translation_id(translation_repo, translation_service)

    result = await translation_service.get_or_translate("site1", "/home", "hi")
    assert result == {"t1": "Hello"}


async def test_get_or_translate_generates_draft_but_serves_source(
    translation_repo, translation_service, fake_provider
):
    await _seeded_translation_id(translation_repo, translation_service)

    result = await translation_service.get_or_translate("site1", "/home", "hi")
    assert result == {"t1": "Hello"}  # source fallback; draft still generated below
    assert len(fake_provider.calls) == 1

    docs = await translation_repo.find_by_route("site1", "/home")
    assert docs[0]["translations"]["hi"]["text"] == "[hi] Hello"


# ---------------------------------------------------------------------------
# First-party runtime exemption (ContentWebApp UI) vs partner approval gate.
# First-party AI translations are served at runtime WITHOUT approval; partner
# sites keep the gate. Identity is by explicit FIRST_PARTY_SITE_IDS allowlist.
# ---------------------------------------------------------------------------


def _settings_first_party(ids: str) -> Settings:
    return Settings(translation_provider="openai", openai_api_key="sk-test", first_party_site_ids=ids)


async def test_first_party_serves_unapproved_ai_but_keeps_status_pending(
    monkeypatch, translation_repo, translation_service
):
    # site1 opted in => its fresh AI draft is served immediately, unapproved...
    monkeypatch.setattr(ts_module, "get_settings", lambda: _settings_first_party("site1"))
    await _seeded_translation_id(translation_repo, translation_service)

    result = await translation_service.get_or_translate("site1", "/home", "hi")
    assert result == {"t1": "[hi] Hello"}  # AI served without human approval

    # ...and the DB status stays pending (serve-time-only bypass, no auto-approve).
    docs = await translation_repo.find_by_route("site1", "/home")
    assert docs[0]["translations"]["hi"]["status"] == "pending"


async def test_first_party_runtime_translate_path_serves_unapproved(
    monkeypatch, translation_repo, translation_service
):
    # The public SDK path (runtime_translate -> _generate_translations) also serves.
    monkeypatch.setattr(ts_module, "get_settings", lambda: _settings_first_party("site1"))
    await _seeded_translation_id(translation_repo, translation_service)
    result = await translation_service.runtime_translate("site1", "/home", "hi")
    assert result == {"t1": "[hi] Hello"}
    docs = await translation_repo.find_by_route("site1", "/home")
    assert docs[0]["translations"]["hi"]["status"] == "pending"  # still pending


async def test_partner_site_keeps_gate_even_when_first_party_configured(
    monkeypatch, translation_repo, translation_service
):
    # Only site1 is first-party; site2 (partner) keeps the approval gate.
    monkeypatch.setattr(ts_module, "get_settings", lambda: _settings_first_party("site1"))
    await translation_service.extract_items(
        "site2", [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}]
    )
    # pending -> source
    assert await translation_service.get_or_translate("site2", "/home", "hi") == {"t1": "Hello"}
    docs = await translation_repo.find_by_route("site2", "/home")
    tid = str(docs[0]["_id"])
    # approve -> translated
    await translation_service.approve_translation(tid, "hi", "reviewer@example.com")
    assert await translation_service.get_or_translate("site2", "/home", "hi") == {"t1": "[hi] Hello"}


async def test_partner_rejected_serves_source_even_when_first_party_configured(
    monkeypatch, translation_repo, translation_service
):
    monkeypatch.setattr(ts_module, "get_settings", lambda: _settings_first_party("site1"))
    await translation_service.extract_items(
        "site2", [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}]
    )
    await translation_service.get_or_translate("site2", "/home", "hi")  # generate draft
    docs = await translation_repo.find_by_route("site2", "/home")
    tid = str(docs[0]["_id"])
    await translation_service.reject_translation(tid, "hi", "reviewer@example.com", "no")
    assert await translation_service.get_or_translate("site2", "/home", "hi") == {"t1": "Hello"}


async def test_empty_allowlist_gates_all_sites(
    monkeypatch, translation_repo, translation_service
):
    # Safe default: no first-party configured => site1 keeps the gate (source).
    monkeypatch.setattr(ts_module, "get_settings", lambda: _settings_first_party(""))
    await _seeded_translation_id(translation_repo, translation_service)
    assert await translation_service.get_or_translate("site1", "/home", "hi") == {"t1": "Hello"}


async def test_get_stored_translations_reads_only_never_calls_provider(
    translation_repo, translation_service, fake_provider
):
    # Runtime read path: one item has a stored (but unapproved) translation,
    # one has none. Neither is served — approval gate falls both back to
    # source text. The AI provider is NEVER called inline (that would
    # stall/502 an uncovered route).
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

    # t1's stored translation is never approved, so it falls back to source too.
    assert result == {"t1": "Hello", "t2": "World"}
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
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")

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
    await translation_service.approve_translation(id1, "hi", "reviewer@example.com")
    assert len(fake_provider.calls) == 1

    # site1/t2 has identical source text "Hello" on a different route, same site.
    await translation_service.extract_items(
        "site1", [{"key": "t2", "text": "Hello", "route": "/about", "sourceLang": "en"}]
    )

    # site1/t2 is served immediately (auto-approve) — and the stored translation
    # came from TM, not a second AI call.
    result = await translation_service.get_or_translate("site1", "/about", "hi")
    assert result == {"t2": "[hi] Hello"}
    assert len(fake_provider.calls) == 1  # TM reuse, no second AI call

    docs = await translation_repo.find_by_route("site1", "/about")
    assert docs[0]["translations"]["hi"]["text"] == "[hi] Hello"
    assert docs[0]["translations"]["hi"]["provider"] == "TranslationMemory"
    # TM reuse auto-approves the new document (find_exact_match only ever
    # matches already-approved content, so this is not skipping review).
    assert docs[0]["status"] == "approved"


async def test_translation_memory_scoped_to_site_no_cross_tenant_reuse(
    translation_repo, translation_service, fake_provider
):
    # site1/t1 gets an approved "Hello" -> "[hi] Hello".
    id1 = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(id1, "hi", "reviewer@example.com")
    assert len(fake_provider.calls) == 1

    # site2 has identical source text "Hello" — must NOT reuse site1's
    # approved TM entry; a fresh AI call is required per tenant.
    await translation_service.extract_items(
        "site2", [{"key": "t2", "text": "Hello", "route": "/about", "sourceLang": "en"}]
    )
    await translation_service.get_or_translate("site2", "/about", "hi")
    assert len(fake_provider.calls) == 2

    docs = await translation_repo.find_by_route("site2", "/about")
    assert docs[0]["translations"]["hi"]["provider"] != "TranslationMemory"


async def test_translation_memory_no_match_falls_through_to_ai_call(
    translation_repo, translation_service, fake_provider
):
    await translation_service.extract_items(
        "site1", [{"key": "t1", "text": "Unique phrase", "route": "/home", "sourceLang": "en"}]
    )

    result = await translation_service.get_or_translate("site1", "/home", "hi")

    assert result == {"t1": "Unique phrase"}  # no TM match; AI draft generated but not served
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
    await translation_service.approve_translation(id1, "hi", "reviewer@example.com")

    # site1/t2: AI-generated, left pending (never approved).
    await translation_service.extract_items(
        "site1", [{"key": "t2", "text": "Goodbye", "route": "/bye", "sourceLang": "en"}]
    )
    await translation_service.get_or_translate("site1", "/bye", "hi")

    # site1/t3: identical source text as t1 -> reused from Translation Memory
    # within the same site, which auto-approves the new document (TM only
    # ever matches content a human already approved elsewhere on that site).
    await translation_service.extract_items(
        "site1", [{"key": "t3", "text": "Hello", "route": "/about", "sourceLang": "en"}]
    )
    await translation_service.get_or_translate("site1", "/about", "hi")

    analytics = await translation_repo.get_analytics()
    assert analytics == {
        "totalTranslations": 3,
        "approvedTranslations": 2,
        "pendingTranslations": 1,
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


async def test_find_by_site_and_analytics_enforce_row_cap(
    monkeypatch, translation_repo, translation_service
):
    # Defensive ceiling, not real pagination — verified here with a small cap
    # (patched in) rather than seeding 20,000 real documents.
    from app.repositories import translation_repository

    monkeypatch.setattr(translation_repository, "MAX_TRANSLATION_ROWS", 3)

    await translation_service.extract_items(
        "site1",
        [
            {"key": f"t{i}", "text": f"Text {i}", "route": "/home", "sourceLang": "en"}
            for i in range(5)
        ],
    )

    docs = await translation_repo.find_by_site("site1")
    assert len(docs) == 3

    analytics = await translation_repo.get_analytics("site1")
    assert analytics["totalTranslations"] == 5  # count_documents is unaffected by the cap
    assert analytics["aiGeneratedTranslations"] <= 3  # but the per-doc scan is capped


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
    # +3 for the translation_service fixture's seeded active websites
    # (site1/site2/s1), needed so _ensure_site_active doesn't reject them.
    assert summary["totalSites"] == 5
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
    await translation_service.approve_translation(id1, "hi", "reviewer@example.com")

    await translation_service.extract_items(
        "site1", [{"key": "t2", "text": "Hello", "route": "/about", "sourceLang": "en"}]
    )
    await translation_service.get_or_translate("site1", "/about", "hi")

    docs = await translation_repo.find_by_route("site1", "/about")
    assert docs[0]["translations"]["hi"]["qualityScore"] == 1.0
    assert docs[0]["translations"]["hi"]["provider"] == "TranslationMemory"


async def test_approve_translation_records_version_one(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")

    doc = await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")

    assert doc["version"] == 1
    history = await translation_service.get_version_history(translation_id)
    assert len(history) == 1
    assert history[0]["version"] == 1
    assert history[0]["approvedBy"] == "reviewer@example.com"
    assert history[0]["translations"]["hi"]["text"] == "[hi] Hello"


async def test_versions_endpoint_admin_access(translation_repo, translation_service):
    from app.controllers.translation_controller import get_version_history
    from app.platform.auth.dependencies import require_translation_reviewer

    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")

    user = await require_translation_reviewer(user={"sub": "u1", "role": "admin"})
    history = await get_version_history(translation_id, service=translation_service, user=user)

    assert len(history) == 1
    assert history[0]["version"] == 1


async def test_versions_endpoint_reviewer_access(translation_repo, translation_service):
    from app.controllers.translation_controller import get_version_history
    from app.platform.auth.dependencies import require_translation_reviewer

    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")

    user = await require_translation_reviewer(user={"sub": "u1", "role": "reviewer"})
    history = await get_version_history(translation_id, service=translation_service, user=user)

    assert len(history) == 1
    assert history[0]["version"] == 1


async def test_versions_endpoint_tenant_access(translation_repo, translation_service):
    from app.controllers.translation_controller import get_version_history
    from app.platform.auth.dependencies import require_translation_reviewer

    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")

    user = await require_translation_reviewer(user={"sub": "u1", "role": "tenant"})
    history = await get_version_history(translation_id, service=translation_service, user=user)

    assert len(history) == 1
    assert history[0]["version"] == 1


async def test_versions_endpoint_school_admin_access(translation_repo, translation_service):
    from app.controllers.translation_controller import get_version_history
    from app.platform.auth.dependencies import require_translation_reviewer

    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")

    user = await require_translation_reviewer(user={"sub": "u1", "role": "school_admin"})
    history = await get_version_history(translation_id, service=translation_service, user=user)

    assert len(history) == 1
    assert history[0]["version"] == 1


async def test_versions_endpoint_content_creator_access(translation_repo, translation_service):
    from app.controllers.translation_controller import get_version_history
    from app.platform.auth.dependencies import require_translation_reviewer

    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")

    user = await require_translation_reviewer(user={"sub": "u1", "role": "content_creator"})
    history = await get_version_history(translation_id, service=translation_service, user=user)

    assert len(history) == 1
    assert history[0]["version"] == 1


async def test_versions_endpoint_unauthorized_access(translation_repo, translation_service):
    from app.platform.auth.dependencies import require_translation_reviewer
    from app.platform.error_handling import ForbiddenError

    with pytest.raises(ForbiddenError):
        await require_translation_reviewer(user={"sub": "u1", "role": "teacher"})


async def test_versions_endpoint_student_unauthorized_access(translation_repo, translation_service):
    from app.platform.auth.dependencies import require_translation_reviewer
    from app.platform.error_handling import ForbiddenError

    with pytest.raises(ForbiddenError):
        await require_translation_reviewer(user={"sub": "u1", "role": "student"})


async def test_reapproval_appends_new_version_without_touching_history(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(translation_id, "hi", "reviewer1@example.com")

    await translation_service.update_translation(translation_id, "hi", "Namaste (edited)")
    doc = await translation_service.approve_translation(translation_id, "hi", "reviewer2@example.com")

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

    approved_doc = await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")
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
    await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")

    trail = await translation_service.get_audit_trail("site1", route="/home", key="t1")
    actions = [e["action"] for e in trail]
    assert "approved" in actions
    approved = next(e for e in trail if e["action"] == "approved")
    assert approved["actor"] == "reviewer@example.com"


async def test_get_audit_trail_is_newest_first(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")  # translated
    await translation_service.approve_translation(translation_id, "hi", "reviewer@example.com")  # approved

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
    # Approval gate: draft generated but not approved yet -> served as source text.
    assert result == {"t1": "Hello", "t2": "World"}

    docs = await translation_repo.find_by_route("site1", "/h")
    assert all(d["translations"]["hi"]["text"].startswith("[hi]") for d in docs)

    trail = await translation_service.get_audit_trail("site1", route="/h", key="t1")
    assert "translated" in [e["action"] for e in trail]


async def test_runtime_batch_per_item_gate_uses_per_language_status_not_doc_level(mock_db):
    """Regression: the per-item fallback in _runtime_batch_ai must gate on the
    per-language status (translations.{lang}.status), not the document-level
    status. A Translation Memory auto-approve on ANOTHER language sets the
    doc-level status to "approved"; generating a new, still-pending language on
    the same document must still serve source text — never leak the fresh
    unreviewed AI draft.
    """
    await mock_db["websites"].insert_one({"siteId": "site1", "status": "Active"})

    class _BatchFailsProvider(TranslationProvider):
        async def translate(self, text, source_lang, target_lang):
            return f"[{target_lang}] {text}"

        async def translate_batch(self, texts, source_lang, target_lang):
            raise ValueError("force the per-item fallback path")

    service = TranslationService(
        mock_db,
        lambda: _BatchFailsProvider(),
        enforce_origin_check=False,
        enforce_lang_validation=False,
    )
    repo = TranslationRepository(mock_db)
    await repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    # Simulate a prior TM auto-approve on a DIFFERENT language: doc-level status
    # flips to "approved" while "hi" has no translation yet.
    await mock_db["translations"].update_one(
        {"siteId": "site1", "route": "/h", "key": "t1"},
        {"$set": {
            "status": "approved",
            "translations.ta": {"text": "[ta] Hello", "status": "approved"},
        }},
    )

    result = await service.runtime_translate("site1", "/h", "hi")

    # hi is a fresh pending draft -> serve SOURCE despite doc-level "approved".
    assert result == {"t1": "Hello"}
    doc = (await repo.find_by_route("site1", "/h"))[0]
    assert doc["translations"]["hi"]["status"] == "pending"  # per-language, unapproved
    assert doc["translations"]["hi"]["text"] == "[hi] Hello"  # draft stored, not served


# ---------------------------------------------------------------------------
# bulk_approve_pending — reviewer "approve all pending" driver. Must approve
# each requested language per document via the same per-language approve path,
# never a document-level shortcut, and never expose unapproved AI.
# ---------------------------------------------------------------------------


async def test_bulk_approve_pending_approves_all_pending_and_skips_approved(
    translation_repo, translation_service
):
    # t1: two pending languages; t2: one already-approved language.
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")
    await translation_repo.save_translation("site1", "/h", "t1", "mr", "[mr] Hello", "P")
    await translation_repo.upsert_source("site1", "/h", "t2", "en", "World")
    await translation_repo.save_translation("site1", "/h", "t2", "ta", "[ta] World", "P")
    t2 = next(d for d in await translation_repo.find_by_route("site1", "/h") if d["key"] == "t2")
    await translation_service.approve_translation(str(t2["_id"]), "ta", "rev@example.com")

    res = await translation_service.bulk_approve_pending("site1", "rev@example.com")
    assert res == {"approved": 2, "skipped": 1}  # hi+mr approved; ta already approved -> skipped

    docs = {d["key"]: d for d in await translation_repo.find_by_route("site1", "/h")}
    assert docs["t1"]["translations"]["hi"]["status"] == "approved"
    assert docs["t1"]["translations"]["mr"]["status"] == "approved"
    assert docs["t2"]["translations"]["ta"]["status"] == "approved"  # untouched


async def test_bulk_approve_pending_lang_scope_isolates_other_languages(
    translation_repo, translation_service
):
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")
    await translation_repo.save_translation("site1", "/h", "t1", "mr", "[mr] Hello", "P")

    res = await translation_service.bulk_approve_pending("site1", "rev@example.com", lang="hi")
    assert res == {"approved": 1, "skipped": 0}

    doc = (await translation_repo.find_by_route("site1", "/h"))[0]
    assert doc["translations"]["hi"]["status"] == "approved"
    assert doc["translations"]["mr"]["status"] == "pending"  # per-language: untouched


async def test_bulk_approve_pending_route_scope_leaves_other_routes(
    translation_repo, translation_service
):
    await translation_repo.upsert_source("site1", "/a", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/a", "t1", "hi", "[hi] Hello", "P")
    await translation_repo.upsert_source("site1", "/b", "t2", "en", "World")
    await translation_repo.save_translation("site1", "/b", "t2", "hi", "[hi] World", "P")

    res = await translation_service.bulk_approve_pending("site1", "rev@example.com", route="/a")
    assert res == {"approved": 1, "skipped": 0}

    a = (await translation_repo.find_by_route("site1", "/a"))[0]
    b = (await translation_repo.find_by_route("site1", "/b"))[0]
    assert a["translations"]["hi"]["status"] == "approved"
    assert b["translations"]["hi"]["status"] == "pending"  # other route untouched


async def test_bulk_approve_pending_does_not_serve_unapproved_languages(
    translation_repo, translation_service
):
    # Approving hi must not make a still-pending mr draft servable (gate intact).
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")
    await translation_repo.save_translation("site1", "/h", "t1", "mr", "[mr] Hello", "P")

    await translation_service.bulk_approve_pending("site1", "rev@example.com", lang="hi")

    served_hi = await translation_service.get_or_translate("site1", "/h", "hi")
    served_mr = await translation_service.get_or_translate("site1", "/h", "mr")
    assert served_hi == {"t1": "[hi] Hello"}  # approved -> served
    assert served_mr == {"t1": "Hello"}       # pending AI -> source, never leaked


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
# Origin binding — a public siteId alone must not be enough to write/read
# under someone else's tenant (PR #276 review: unauthenticated cost/write abuse)
# ---------------------------------------------------------------------------


@pytest.fixture
async def bound_service(mock_db, fake_provider):
    from app.repositories.language_repository import LanguageRepository

    await mock_db["websites"].insert_many(
        [{"siteId": "site1", "status": "Active", "domain": "acme.example"}]
    )
    await LanguageRepository(mock_db).create("Hindi", "hi", "ltr", True)
    return TranslationService(mock_db, lambda: fake_provider)


async def test_extract_items_rejects_origin_mismatch(bound_service):
    from app.platform.error_handling import ForbiddenError

    with pytest.raises(ForbiddenError):
        await bound_service.extract_items(
            "site1",
            [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
            origin="https://evil.example",
        )


async def test_extract_items_rejects_missing_origin(bound_service):
    from app.platform.error_handling import ForbiddenError

    with pytest.raises(ForbiddenError):
        await bound_service.extract_items(
            "site1",
            [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
        )


async def test_extract_items_allows_matching_origin(bound_service):
    await bound_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
        origin="https://acme.example",
    )


async def test_extract_items_allows_matching_referer_when_origin_absent(bound_service):
    await bound_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
        referer="https://acme.example/pricing",
    )


async def test_runtime_translate_rejects_origin_mismatch(bound_service):
    from app.platform.error_handling import ForbiddenError

    await bound_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"}],
        origin="https://acme.example",
    )
    with pytest.raises(ForbiddenError):
        await bound_service.runtime_translate("site1", "/h", "hi", origin="https://evil.example")


@pytest.fixture
async def localhost_bound_service(mock_db, fake_provider):
    from app.repositories.language_repository import LanguageRepository

    await mock_db["websites"].insert_many(
        [{"siteId": "site-local", "status": "Active", "domain": "127.0.0.1"}]
    )
    await LanguageRepository(mock_db).create("Hindi", "hi", "ltr", True)
    return TranslationService(mock_db, lambda: fake_provider)


async def test_dev_localhost_alias_disabled_by_default_still_rejects(localhost_bound_service):
    from app.platform.error_handling import ForbiddenError

    with pytest.raises(ForbiddenError):
        await localhost_bound_service.extract_items(
            "site-local",
            [{"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"}],
            origin="http://localhost:3000",
        )


async def test_dev_localhost_alias_when_enabled_allows_localhost_for_127001_site(
    monkeypatch, localhost_bound_service
):
    import app.services.translation_service as ts

    class _AliasSettings:
        enable_dev_localhost_origin_alias = True

    monkeypatch.setattr(ts, "get_settings", lambda: _AliasSettings())

    await localhost_bound_service.extract_items(
        "site-local",
        [{"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"}],
        origin="http://localhost:3000",
    )
    result = await localhost_bound_service.runtime_translate(
        "site-local", "/h", "hi", origin="http://localhost:3000"
    )
    assert result == {"t1": "Hello"}


async def test_dev_localhost_alias_when_enabled_still_rejects_unrelated_origin(
    monkeypatch, localhost_bound_service
):
    import app.services.translation_service as ts
    from app.platform.error_handling import ForbiddenError

    class _AliasSettings:
        enable_dev_localhost_origin_alias = True

    monkeypatch.setattr(ts, "get_settings", lambda: _AliasSettings())

    with pytest.raises(ForbiddenError):
        await localhost_bound_service.extract_items(
            "site-local",
            [{"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"}],
            origin="https://evil.example",
        )


# ---------------------------------------------------------------------------
# lang validation — arbitrary target langs must not trigger paid inline MT
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# PR #276 review #9 — authenticated admin/reviewer extract path must not hit
# the public SDK's origin binding, but must still require the website be
# Active (permission check is enforced by the route's own dependency).
# ---------------------------------------------------------------------------


async def test_extract_items_for_review_succeeds_with_no_origin_or_referer(bound_service):
    # extract_items (public path) would 403 here; extract_items_for_review
    # (authenticated admin/reviewer path) must not.
    await bound_service.extract_items_for_review(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
    )
    docs = await bound_service.get_stored_translations("site1", "/home", "hi")
    assert docs == {"t1": "Hello"}


async def test_extract_items_for_review_still_requires_active_site(bound_service, mock_db):
    from app.platform.error_handling import NotFoundError

    await mock_db["websites"].update_one({"siteId": "site1"}, {"$set": {"status": "Inactive"}})
    with pytest.raises(NotFoundError):
        await bound_service.extract_items_for_review(
            "site1",
            [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
        )


async def test_public_extract_items_still_rejects_origin_mismatch_after_fix(bound_service):
    # Regression guard: the #9 fix must not have touched the public path's
    # origin enforcement.
    from app.platform.error_handling import ForbiddenError

    with pytest.raises(ForbiddenError):
        await bound_service.extract_items(
            "site1",
            [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
            origin="https://evil.example",
        )


# ---------------------------------------------------------------------------
# PR #276 review #11 — origin/domain comparison must treat www.<domain> and
# <domain> as the same site, without introducing general subdomain/suffix
# matching.
# ---------------------------------------------------------------------------


async def test_origin_www_prefix_matches_bare_domain(bound_service):
    # website domain is "acme.example" (bare); origin is "www.acme.example".
    await bound_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
        origin="https://www.acme.example",
    )


async def test_origin_bare_domain_matches_www_registered_domain(mock_db, fake_provider):
    from app.repositories.language_repository import LanguageRepository
    from app.services.translation_service import TranslationService

    await mock_db["websites"].insert_many(
        [{"siteId": "site-www", "status": "Active", "domain": "www.acme.example"}]
    )
    await LanguageRepository(mock_db).create("Hindi", "hi", "ltr", True)
    service = TranslationService(mock_db, lambda: fake_provider)

    await service.extract_items(
        "site-www",
        [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
        origin="https://acme.example",
    )


async def test_origin_subdomain_other_than_www_still_rejected(bound_service):
    from app.platform.error_handling import ForbiddenError

    with pytest.raises(ForbiddenError):
        await bound_service.extract_items(
            "site1",
            [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
            origin="https://api.acme.example",
        )


async def test_origin_unrelated_domain_still_rejected(bound_service):
    from app.platform.error_handling import ForbiddenError

    with pytest.raises(ForbiddenError):
        await bound_service.extract_items(
            "site1",
            [{"key": "t1", "text": "Hello", "route": "/home", "sourceLang": "en"}],
            origin="https://evil.com",
        )


async def test_localhost_alias_behavior_unaffected_by_www_fix(
    monkeypatch, localhost_bound_service
):
    import app.services.translation_service as ts

    class _AliasSettings:
        enable_dev_localhost_origin_alias = True

    monkeypatch.setattr(ts, "get_settings", lambda: _AliasSettings())

    await localhost_bound_service.extract_items(
        "site-local",
        [{"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"}],
        origin="http://localhost:3000",
    )


async def test_runtime_translate_rejects_unknown_lang(bound_service):
    from app.platform.error_handling import ValidationError

    await bound_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"}],
        origin="https://acme.example",
    )
    with pytest.raises(ValidationError):
        await bound_service.runtime_translate("site1", "/h", "xx-not-a-lang", origin="https://acme.example")


async def test_runtime_translate_accepts_enabled_lang(bound_service, fake_provider):
    await bound_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"}],
        origin="https://acme.example",
    )
    result = await bound_service.runtime_translate("site1", "/h", "hi", origin="https://acme.example")
    assert result == {"t1": "Hello"}  # draft generated, not yet approved -> source fallback
    assert len(fake_provider.calls) == 1


# ---------------------------------------------------------------------------
# Manual approval gate — a fresh AI draft is never exposed until a human
# approves it, on every generation path (runtime_translate, generate_for_review).
# ---------------------------------------------------------------------------


async def test_runtime_translate_serves_translated_text_only_after_approval(
    translation_repo, translation_service
):
    await translation_service.extract_items(
        "site1", [{"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"}]
    )

    pending = await translation_service.runtime_translate("site1", "/h", "hi")
    assert pending == {"t1": "Hello"}  # source fallback while pending review

    doc = (await translation_repo.find_by_route("site1", "/h"))[0]
    assert doc.get("status") != "approved"
    assert doc["translations"]["hi"]["text"] == "[hi] Hello"  # draft stored, not served

    await translation_service.approve_translation(str(doc["_id"]), "hi", "reviewer@example.com")

    approved = await translation_service.runtime_translate("site1", "/h", "hi")
    assert approved == {"t1": "[hi] Hello"}


async def test_generate_for_review_stores_pending_and_does_not_expose_translation(
    translation_repo, translation_service
):
    await translation_service.extract_items(
        "site1", [{"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"}]
    )

    result = await translation_service.generate_for_review("site1", "/h", "hi")
    assert result == {"t1": "Hello"}  # pending -> source fallback, same as runtime path

    doc = (await translation_repo.find_by_route("site1", "/h"))[0]
    assert doc.get("status") != "approved"
    assert doc["translations"]["hi"]["text"] == "[hi] Hello"


async def test_generate_for_review_serves_translated_text_after_approval(
    translation_repo, translation_service
):
    await translation_service.extract_items(
        "site1", [{"key": "t1", "text": "Hello", "route": "/h", "sourceLang": "en"}]
    )
    await translation_service.generate_for_review("site1", "/h", "hi")
    doc = (await translation_repo.find_by_route("site1", "/h"))[0]

    await translation_service.approve_translation(str(doc["_id"]), "hi", "reviewer@example.com")

    result = await translation_service.generate_for_review("site1", "/h", "hi")
    assert result == {"t1": "[hi] Hello"}

    # Runtime SDK path must also now serve the approved text.
    runtime_result = await translation_service.runtime_translate("site1", "/h", "hi")
    assert runtime_result == {"t1": "[hi] Hello"}


async def test_generate_for_review_translation_memory_reuse_still_auto_approves(
    translation_repo, translation_service, fake_provider
):
    # Preserve existing TM behavior on the generate_for_review path: reusing
    # already-approved content is not a fresh AI draft, so it stays auto-approved.
    id1 = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.generate_for_review("site1", "/home", "hi")
    await translation_service.approve_translation(id1, "hi", "reviewer@example.com")
    assert len(fake_provider.calls) == 1

    await translation_service.extract_items(
        "site1", [{"key": "t2", "text": "Hello", "route": "/about", "sourceLang": "en"}]
    )
    result = await translation_service.generate_for_review("site1", "/about", "hi")

    assert result == {"t2": "[hi] Hello"}
    assert len(fake_provider.calls) == 1  # TM reuse, no second AI call

    doc = (await translation_repo.find_by_route("site1", "/about"))[0]
    assert doc["translations"]["hi"]["provider"] == "TranslationMemory"
    assert doc["status"] == "approved"


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


# ---------------------------------------------------------------------------
# PR #276 review #10 — per-language approval state. Approving/rejecting one
# language on a document must never approve, reject, or otherwise change any
# other language already on that same document.
# ---------------------------------------------------------------------------


async def _seed_two_langs(translation_repo, translation_service):
    """One doc, Kannada ("kn") and Malayalam ("ml") both generated, both pending."""
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "kn")
    await translation_service.get_or_translate("site1", "/home", "ml")
    return translation_id


async def test_approving_kannada_leaves_malayalam_pending_only_kannada_served(
    translation_repo, translation_service
):
    translation_id = await _seed_two_langs(translation_repo, translation_service)

    await translation_service.approve_translation(translation_id, "kn", "reviewer@example.com")

    kn_result = await translation_service.get_or_translate("site1", "/home", "kn")
    ml_result = await translation_service.get_or_translate("site1", "/home", "ml")

    assert kn_result == {"t1": "[kn] Hello"}  # served
    assert ml_result == {"t1": "Hello"}  # still pending -> source fallback


async def test_malayalam_generated_after_kannada_approved_still_starts_pending(
    translation_repo, translation_service
):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "kn")
    await translation_service.approve_translation(translation_id, "kn", "reviewer@example.com")

    # Malayalam generated for the first time AFTER Kannada is already approved
    # on this doc -- must not inherit Kannada's approved state.
    ml_result = await translation_service.get_or_translate("site1", "/home", "ml")
    assert ml_result == {"t1": "Hello"}  # pending -> source fallback

    doc = await translation_service.get_translation(translation_id)
    assert doc["translations"]["ml"]["status"] == "pending"
    assert doc["translations"]["kn"]["status"] == "approved"


async def test_rejecting_malayalam_does_not_affect_approved_kannada(
    translation_repo, translation_service
):
    translation_id = await _seed_two_langs(translation_repo, translation_service)
    await translation_service.approve_translation(translation_id, "kn", "reviewer@example.com")

    await translation_service.reject_translation(translation_id, "ml", "reviewer@example.com", "needs work")

    kn_result = await translation_service.get_or_translate("site1", "/home", "kn")
    ml_result = await translation_service.get_or_translate("site1", "/home", "ml")

    assert kn_result == {"t1": "[kn] Hello"}  # unaffected by ml's rejection
    assert ml_result == {"t1": "Hello"}  # rejected -> source fallback

    doc = await translation_service.get_translation(translation_id)
    assert doc["translations"]["kn"]["status"] == "approved"
    assert doc["translations"]["ml"]["status"] == "rejected"


async def test_approving_malayalam_while_kannada_pending_serves_only_malayalam(
    translation_repo, translation_service
):
    translation_id = await _seed_two_langs(translation_repo, translation_service)

    await translation_service.approve_translation(translation_id, "ml", "reviewer@example.com")

    kn_result = await translation_service.get_or_translate("site1", "/home", "kn")
    ml_result = await translation_service.get_or_translate("site1", "/home", "ml")

    assert kn_result == {"t1": "Hello"}  # still pending
    assert ml_result == {"t1": "[ml] Hello"}  # served


async def test_approving_one_language_does_not_change_another_languages_status(
    translation_repo, translation_service
):
    translation_id = await _seed_two_langs(translation_repo, translation_service)

    await translation_service.approve_translation(translation_id, "kn", "reviewer@example.com")

    doc = await translation_service.get_translation(translation_id)
    assert doc["translations"]["kn"]["status"] == "approved"
    assert doc["translations"]["ml"]["status"] == "pending"  # untouched


async def test_rejecting_one_language_does_not_change_another_languages_status(
    translation_repo, translation_service
):
    translation_id = await _seed_two_langs(translation_repo, translation_service)

    await translation_service.reject_translation(translation_id, "kn", "reviewer@example.com", "bad")

    doc = await translation_service.get_translation(translation_id)
    assert doc["translations"]["kn"]["status"] == "rejected"
    assert doc["translations"]["ml"]["status"] == "pending"  # untouched


async def test_translation_memory_reuse_only_matches_approved_target_language(
    translation_repo, translation_service, fake_provider
):
    # site1/t1: Kannada approved, Malayalam left pending.
    translation_id = await _seed_two_langs(translation_repo, translation_service)
    await translation_service.approve_translation(translation_id, "kn", "reviewer@example.com")
    assert len(fake_provider.calls) == 2  # kn + ml drafts generated above

    # site1/t2: identical source text "Hello" on a different route.
    await translation_service.extract_items(
        "site1", [{"key": "t2", "text": "Hello", "route": "/about", "sourceLang": "en"}]
    )

    # Requesting kn reuses the approved kn TM entry -- no AI call.
    kn_result = await translation_service.get_or_translate("site1", "/about", "kn")
    assert kn_result == {"t2": "[kn] Hello"}
    assert len(fake_provider.calls) == 2  # TM reuse, no new call

    # Requesting ml for the same source text must NOT reuse anything (only kn
    # is approved for this source text) -- falls through to a fresh AI draft.
    ml_result = await translation_service.get_or_translate("site1", "/about", "ml")
    assert ml_result == {"t2": "Hello"}  # fresh draft, pending -> source fallback
    assert len(fake_provider.calls) == 3  # fresh AI call, TM did not match

    docs = await translation_repo.find_by_route("site1", "/about")
    assert docs[0]["translations"]["ml"]["provider"] != "TranslationMemory"


async def test_existing_document_level_approved_record_continues_to_serve(
    translation_repo, translation_service
):
    """Guards the genuinely pre-existing-data shape: a document whose
    per-language status was set to "approved" some other way (a real
    approve_translation call, or hand-set here to simulate one) while the
    legacy doc-level status field also happens to be "approved". Note this
    is NOT what migration 021 produces -- 021 only ever backfills missing
    per-language status to "pending" (see its module docstring), since
    legacy doc-level approvals carry no per-language attribution."""
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "kn")

    # Simulate a record whose per-language status is genuinely "approved",
    # with doc-level status also "approved".
    await translation_repo._col.update_one(
        {"_id": translation_repo._to_id(translation_id)},
        {
            "$set": {
                "translations.kn.status": "approved",
                "status": "approved",
            }
        },
    )

    result = await translation_service.get_or_translate("site1", "/home", "kn")
    assert result == {"t1": "[kn] Hello"}


# ---------------------------------------------------------------------------
# Regression: no translation creation path may omit translations.{lang}.status
#
# Found via real-partner-site investigation: 180 documents (and 880 DB-wide)
# had translations.{lang} entries with no "status" field at all, because they
# were written by a pre-#10 server build whose save_translation/
# approve_translation never set a per-language status field (doc-level
# status only). Current code (save_translation/approve_translation/
# reject_translation) always sets it -- these tests pin that invariant so it
# can never silently regress.
# ---------------------------------------------------------------------------


def _all_translation_entries_have_status(doc: dict) -> bool:
    return all(
        isinstance(entry, dict) and "status" in entry
        for entry in (doc.get("translations") or {}).values()
    )


async def test_save_translation_always_sets_per_language_status(translation_repo):
    await translation_repo.upsert_source("site1", "/home", "t1", "en", "Hello")

    await translation_repo.save_translation(
        "site1", "/home", "t1", "kn", "[kn] Hello", "FakeProvider",
    )
    doc = (await translation_repo.find_by_route("site1", "/home"))[0]
    assert doc["translations"]["kn"]["status"] == "pending"
    assert _all_translation_entries_have_status(doc)


async def test_save_translation_auto_approved_still_sets_status(translation_repo):
    """Translation Memory reuse is the one persist-time auto-approve path --
    it must set "approved", never omit the field."""
    await translation_repo.upsert_source("site1", "/home", "t1", "en", "Hello")

    await translation_repo.save_translation(
        "site1", "/home", "t1", "kn", "[kn] Hello", "TranslationMemory", auto_approved=True,
    )
    doc = (await translation_repo.find_by_route("site1", "/home"))[0]
    assert doc["translations"]["kn"]["status"] == "approved"
    assert _all_translation_entries_have_status(doc)


async def test_get_or_translate_persisted_draft_always_has_status(
    translation_repo, translation_service
):
    """The runtime SDK path (get_or_translate) generates-and-persists a draft
    for any missing language -- that draft must always carry a per-language
    status (pending), never a bare translations.{lang} entry."""
    await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "kn")

    doc = (await translation_repo.find_by_route("site1", "/home"))[0]
    assert doc["translations"]["kn"]["status"] == "pending"
    assert _all_translation_entries_have_status(doc)


async def test_generate_for_review_persisted_draft_always_has_status(
    translation_repo, translation_service
):
    await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.generate_for_review("site1", "/home", "kn")

    doc = (await translation_repo.find_by_route("site1", "/home"))[0]
    assert doc["translations"]["kn"]["status"] == "pending"
    assert _all_translation_entries_have_status(doc)


async def test_approve_translation_sets_status_and_never_omits_it(
    translation_repo, translation_service
):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "kn")

    await translation_service.approve_translation(translation_id, "kn", "reviewer@example.com")

    doc = (await translation_repo.find_by_route("site1", "/home"))[0]
    assert doc["translations"]["kn"]["status"] == "approved"
    assert _all_translation_entries_have_status(doc)


async def test_reject_translation_sets_status_and_never_omits_it(
    translation_repo, translation_service
):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "kn")

    await translation_service.reject_translation(translation_id, "kn", "reviewer@example.com", "needs work")

    doc = (await translation_repo.find_by_route("site1", "/home"))[0]
    assert doc["translations"]["kn"]["status"] == "rejected"
    assert _all_translation_entries_have_status(doc)


def test_only_translation_repository_and_migration_021_write_translations_collection():
    """Structural guard against a bypass path: db["translations"] (or
    equivalent .translations. access) must only ever be written through
    TranslationRepository, so the per-language status invariant above can't
    be silently defeated by some other module writing the collection
    directly. This is exactly how the 880-document real-data bug happened --
    a code path (an old server build, pre-#10) wrote the collection without
    going through the current save/approve/reject methods."""
    import pathlib
    import re

    platform_root = pathlib.Path(__file__).resolve().parents[2]
    app_root = platform_root / "app"
    allowed = {app_root / "repositories" / "translation_repository.py"}

    pattern = re.compile(r'db\[\s*["\']translations["\']\s*\]|\.translations\.')
    offenders = []
    for path in app_root.rglob("*.py"):
        if path in allowed:
            continue
        text = path.read_text(encoding="utf-8")
        if pattern.search(text):
            offenders.append(str(path.relative_to(platform_root)))

    assert offenders == [], (
        f"Found code outside TranslationRepository writing the translations "
        f"collection directly: {offenders}"
    )


async def test_migration_021_never_infers_approved_status_from_doc_level_status():
    """Pins the real-data fix: migration 021 must set every missing
    translations.{lang}.status to "pending" -- even when the document's
    legacy top-level status is "approved" -- because pre-#10 approvals carry
    no per-language attribution (see module docstring in migrations/021)."""
    import importlib.util
    import pathlib

    migrations_dir = pathlib.Path(__file__).resolve().parents[2] / "migrations"
    spec = importlib.util.spec_from_file_location(
        "migration_021", migrations_dir / "021_translations_per_language_status.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    db = AsyncMongoMockClient()["test_seeds"]
    col = db["translations"]
    await col.insert_one(
        {
            "siteId": "site1",
            "route": "/home",
            "key": "t1",
            "status": "approved",
            "approvedBy": "reviewer@example.com",
            "translations": {
                "hi": {"text": "नमस्ते", "provider": "AzureTranslationProvider"},
                "kn": {"text": "ಹಲೋ", "provider": "AzureTranslationProvider"},
            },
        }
    )
    await col.insert_one(
        {
            "siteId": "site1",
            "route": "/about",
            "key": "t2",
            "status": "rejected",
            "translations": {
                "hi": {"text": "नमस्ते", "provider": "AzureTranslationProvider"},
            },
        }
    )

    class _FakeMongoClient:
        def __init__(self, _uri):
            self._db = db

        def get_default_database(self):
            return self._db

        def __getitem__(self, _name):
            return self._db

        async def close(self):
            pass

    import pymongo

    original = pymongo.AsyncMongoClient
    pymongo.AsyncMongoClient = _FakeMongoClient
    try:
        await module.migrate("mongodb://fake/test_seeds", dry_run=False)
    finally:
        pymongo.AsyncMongoClient = original

    approved_doc = await col.find_one({"key": "t1"})
    assert approved_doc["translations"]["hi"]["status"] == "pending"
    assert approved_doc["translations"]["kn"]["status"] == "pending"

    rejected_doc = await col.find_one({"key": "t2"})
    assert rejected_doc["translations"]["hi"]["status"] == "pending"
