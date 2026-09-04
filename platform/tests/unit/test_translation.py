
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
            {"site_id": "site1", "status": "Active"},
            {"site_id": "site2", "status": "Active"},
            {"site_id": "s1", "status": "Active"},
        ]
    )
    return TranslationService(
        mock_db, lambda: fake_provider, enforce_origin_check=False, enforce_lang_validation=False
    )




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

    monkeypatch.setattr(tp, "_BASE_BACKOFF_SECONDS", 0)
    provider = GroqTranslationProvider("gsk-test", "llama-3.3-70b-versatile")
    response = _FakeResponse(status=503, text="service unavailable")
    monkeypatch.setattr(aiohttp, "ClientSession", lambda: _FakeSession(response))

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




async def test_save_translation_then_find_by_keys(translation_repo):
    await translation_repo.upsert_source("site1", "/home", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/home", "t1", "hi", "Namaste", "OpenAITranslationProvider")

    docs = await translation_repo.find_by_keys("site1", ["t1"])
    assert len(docs) == 1
    assert docs[0]["translations"]["hi"]["text"] == "Namaste"
    assert docs[0]["translations"]["hi"]["provider"] == "OpenAITranslationProvider"


async def _seeded_translation_id(translation_repo, translation_service):
    await translation_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/home", "source_lang": "en"}],
    )
    docs = await translation_repo.find_by_route("site1", "/home")
    return str(docs[0]["_id"])


def _settings_first_party(ids: str) -> Settings:
    return Settings(translation_provider="openai", openai_api_key="sk-test", first_party_site_ids=ids)


async def test_empty_allowlist_gates_all_sites(
    monkeypatch, translation_repo, translation_service
):
    monkeypatch.setattr(ts_module, "get_settings", lambda: _settings_first_party(""))
    await _seeded_translation_id(translation_repo, translation_service)
    assert await translation_service.get_or_translate("site1", "/home", "hi") == {"t1": "Hello"}


async def test_get_or_translate_skips_item_on_transient_failure(
    translation_repo, translation_service, monkeypatch
):
    await _seeded_translation_id(translation_repo, translation_service)

    async def _boom(*args, **kwargs):
        raise TransientTranslationError("429 rate limited")

    monkeypatch.setattr(translation_service._provider, "translate", _boom)

    result = await translation_service.get_or_translate("site1", "/home", "hi")
    assert result == {"t1": "Hello"}

    docs = await translation_repo.find_by_route("site1", "/home")
    assert docs[0].get("translations", {}) == {}


async def test_get_analytics_counts_across_pending_approved_ai_and_tm(translation_repo, translation_service):
    id1 = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "hi")
    await translation_service.approve_translation(id1, "hi", "reviewer@example.com")

    await translation_service.extract_items(
        "site1", [{"key": "t2", "text": "Goodbye", "route": "/bye", "source_lang": "en"}]
    )
    await translation_service.get_or_translate("site1", "/bye", "hi")

    await translation_service.extract_items(
        "site1", [{"key": "t3", "text": "Hello", "route": "/about", "source_lang": "en"}]
    )
    await translation_service.get_or_translate("site1", "/about", "hi")

    analytics = await translation_repo.get_analytics()
    assert analytics == {
        "total_translations": 3,
        "approved_translations": 2,
        "pending_translations": 1,
        "ai_generated_translations": 2,
        "translation_memory_reused_translations": 1,
    }


async def test_find_by_site_and_analytics_enforce_row_cap(
    monkeypatch, translation_repo, translation_service
):
    from app.repositories import translation_repository

    monkeypatch.setattr(translation_repository, "MAX_TRANSLATION_ROWS", 3)

    await translation_service.extract_items(
        "site1",
        [
            {"key": f"t{i}", "text": f"Text {i}", "route": "/home", "source_lang": "en"}
            for i in range(5)
        ],
    )

    docs = await translation_repo.find_by_site("site1")
    assert len(docs) == 3

    analytics = await translation_repo.get_analytics("site1")
    assert analytics["total_translations"] == 5
    assert analytics["ai_generated_translations"] <= 3


async def test_runtime_batch_per_item_gate_uses_per_language_status_not_doc_level(mock_db):
    await mock_db["websites"].insert_one({"site_id": "site1", "status": "Active"})

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
    await mock_db["translations"].update_one(
        {"site_id": "site1", "route": "/h", "key": "t1"},
        {"$set": {
            "status": "approved",
            "translations.ta": {"text": "[ta] Hello", "status": "approved"},
        }},
    )

    result = await service.runtime_translate("site1", "/h", "hi")

    assert result == {"t1": "Hello"}
    doc = (await repo.find_by_route("site1", "/h"))[0]
    assert doc["translations"]["hi"]["status"] == "pending"
    assert doc["translations"]["hi"]["text"] == "[hi] Hello"




async def test_bulk_approve_pending_approves_all_pending_and_skips_approved(
    translation_repo, translation_service
):
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")
    await translation_repo.save_translation("site1", "/h", "t1", "mr", "[mr] Hello", "P")
    await translation_repo.upsert_source("site1", "/h", "t2", "en", "World")
    await translation_repo.save_translation("site1", "/h", "t2", "ta", "[ta] World", "P")
    t2 = next(d for d in await translation_repo.find_by_route("site1", "/h") if d["key"] == "t2")
    await translation_service.approve_translation(str(t2["_id"]), "ta", "rev@example.com")

    res = await translation_service.bulk_approve_pending("site1", "rev@example.com")
    assert res == {"approved": 2, "skipped": 1}

    docs = {d["key"]: d for d in await translation_repo.find_by_route("site1", "/h")}
    assert docs["t1"]["translations"]["hi"]["status"] == "approved"
    assert docs["t1"]["translations"]["mr"]["status"] == "approved"
    assert docs["t2"]["translations"]["ta"]["status"] == "approved"


async def test_runtime_translate_reuses_existing_no_regenerate(
    translation_repo, translation_service, fake_provider
):
    await translation_service.extract_items("site1", [
        {"key": "t1", "text": "Hello", "route": "/h", "source_lang": "en"},
    ])
    await translation_service.runtime_translate("site1", "/h", "hi")
    assert len(fake_provider.calls) == 1
    await translation_service.runtime_translate("site1", "/h", "hi")
    assert len(fake_provider.calls) == 1


async def test_runtime_translate_falls_back_to_source_on_transient(
    translation_repo, translation_service, monkeypatch
):
    await translation_service.extract_items("site1", [
        {"key": "t1", "text": "Hi", "route": "/h", "source_lang": "en"},
    ])

    async def boom(*a, **k):
        raise TransientTranslationError("429")

    monkeypatch.setattr(translation_service._provider, "translate_batch", boom)
    monkeypatch.setattr(translation_service._provider, "translate", boom)

    result = await translation_service.runtime_translate("site1", "/h", "hi")
    assert result == {"t1": "Hi"}
    docs = await translation_repo.find_by_route("site1", "/h")
    assert docs[0].get("translations", {}) == {}




@pytest.fixture
async def bound_service(mock_db, fake_provider):
    from app.repositories.language_repository import LanguageRepository

    await mock_db["websites"].insert_many(
        [{"site_id": "site1", "status": "Active", "domain": "acme.example"}]
    )
    await LanguageRepository(mock_db).create("Hindi", "hi", "ltr", True)
    return TranslationService(mock_db, lambda: fake_provider)


@pytest.fixture
async def localhost_bound_service(mock_db, fake_provider):
    from app.repositories.language_repository import LanguageRepository

    await mock_db["websites"].insert_many(
        [{"site_id": "site-local", "status": "Active", "domain": "127.0.0.1"}]
    )
    await LanguageRepository(mock_db).create("Hindi", "hi", "ltr", True)
    return TranslationService(mock_db, lambda: fake_provider)


async def test_extract_items_for_review_succeeds_with_no_origin_or_referer(bound_service):
    await bound_service.extract_items_for_review(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/home", "source_lang": "en"}],
    )
    docs = await bound_service.get_stored_translations("site1", "/home", "hi")
    assert docs == {"t1": "Hello"}


async def test_extract_items_for_review_still_requires_active_site(bound_service, mock_db):

    await mock_db["websites"].update_one({"site_id": "site1"}, {"$set": {"status": "Inactive"}})
    with pytest.raises(NotFoundError):
        await bound_service.extract_items_for_review(
            "site1",
            [{"key": "t1", "text": "Hello", "route": "/home", "source_lang": "en"}],
        )


async def test_runtime_translate_rejects_unknown_lang(bound_service):
    from app.platform.error_handling import ValidationError

    await bound_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/h", "source_lang": "en"}],
        origin="https://acme.example",
    )
    with pytest.raises(ValidationError):
        await bound_service.runtime_translate("site1", "/h", "xx-not-a-lang", origin="https://acme.example")


async def test_generate_for_review_translation_memory_reuse_still_auto_approves(
    translation_repo, translation_service, fake_provider
):
    id1 = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.generate_for_review("site1", "/home", "hi")
    await translation_service.approve_translation(id1, "hi", "reviewer@example.com")
    assert len(fake_provider.calls) == 1

    await translation_service.extract_items(
        "site1", [{"key": "t2", "text": "Hello", "route": "/about", "source_lang": "en"}]
    )
    result = await translation_service.generate_for_review("site1", "/about", "hi")

    assert result == {"t2": "[hi] Hello"}
    assert len(fake_provider.calls) == 1

    doc = (await translation_repo.find_by_route("site1", "/about"))[0]
    assert doc["translations"]["hi"]["provider"] == "TranslationMemory"
    assert doc["status"] == "approved"




def test_score_translation_is_bounded_and_penalises_dropped_placeholder():
    from app.services.quality_scorer import score_translation

    pmap = {"__PH0__": "<b>"}
    survived = score_translation("Hi __PH0__", "Bonjour __PH0__", pmap)
    dropped = score_translation("Hi __PH0__", "Bonjour", pmap)

    assert 0.0 <= dropped <= survived <= 1.0
    assert dropped < survived
    assert score_translation("anything", "", {}) == 0.0


def test_is_low_confidence_default_and_custom_threshold():
    from app.services.quality_scorer import is_low_confidence

    assert is_low_confidence(0.5) is True
    assert is_low_confidence(0.9) is False
    assert is_low_confidence(0.8, threshold=0.85) is True
    assert is_low_confidence(0.8, threshold=0.75) is False


def test_translation_response_exposes_low_confidence_flag():
    from app.models.responses.translation import TranslationResponse

    doc = {
        "_id": "abc",
        "site_id": "s1",
        "route": "/",
        "key": "t1",
        "source_text": "Hello",
        "translations": {
            "hi": {"text": "x", "quality_score": 0.4},
            "ta": {"text": "y", "quality_score": 0.95},
        },
    }
    out = TranslationResponse.from_doc(doc)

    assert out.translations["hi"]["low_confidence"] is True
    assert out.translations["ta"]["low_confidence"] is False
    assert out.low_confidence is True


def test_translation_response_low_confidence_false_when_all_ok():
    from app.models.responses.translation import TranslationResponse

    doc = {
        "_id": "abc", "site_id": "s1", "route": "/", "key": "t1", "source_text": "Hi",
        "translations": {"hi": {"text": "x", "quality_score": 0.95}},
    }
    out = TranslationResponse.from_doc(doc)
    assert out.translations["hi"]["low_confidence"] is False
    assert out.low_confidence is False


async def test_list_translations_low_confidence_only_filters(translation_repo, translation_service):
    await translation_service.extract_items("s1", [
        {"key": "low", "text": "A", "route": "/r", "source_lang": "en"},
        {"key": "ok", "text": "B", "route": "/r", "source_lang": "en"},
    ])
    await translation_repo.save_translation("s1", "/r", "low", "hi", "x", "AI", quality_score=0.4)
    await translation_repo.save_translation("s1", "/r", "ok", "hi", "y", "AI", quality_score=0.95)

    flagged = await translation_service.list_translations("s1", route="/r", low_confidence_only=True)
    assert [d["key"] for d in flagged] == ["low"]

    everything = await translation_service.list_translations("s1", route="/r")
    assert {d["key"] for d in everything} == {"low", "ok"}




async def _seed_two_langs(translation_repo, translation_service):
    translation_id = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.get_or_translate("site1", "/home", "kn")
    await translation_service.get_or_translate("site1", "/home", "ml")
    return translation_id


def _all_translation_entries_have_status(doc: dict) -> bool:
    return all(
        isinstance(entry, dict) and "status" in entry
        for entry in (doc.get("translations") or {}).values()
    )


def test_only_translation_repository_and_migration_021_write_translations_collection():
    import pathlib
    import re

    platform_root = pathlib.Path(__file__).resolve().parents[2]
    app_root = platform_root / "app"
    allowed = {app_root / "repositories" / "translation_repository.py"}

    pattern = re.compile(r'db\[\s*["\']translations["\']\s*\]|db\.translations\b')
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


