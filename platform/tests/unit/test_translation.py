
from __future__ import annotations

import pytest

from app.platform.error_handling import NotFoundError
from app.platform.settings import Settings
from app.providers.translation_provider import (
    AzureTranslationProvider,
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


TENANT = "tenant-1"


@pytest.fixture
async def translation_service(mock_db, fake_provider):
    await mock_db["websites"].insert_many(
        [
            {"site_id": "site1", "status": "Active", "tenant_id": TENANT},
            {"site_id": "site2", "status": "Active", "tenant_id": TENANT},
            {"site_id": "s1", "status": "Active", "tenant_id": TENANT},
        ]
    )
    return TranslationService(mock_db, lambda: fake_provider, enforce_lang_validation=False)




def test_get_translation_provider_returns_azure_with_credentials():
    settings = Settings(azure_translation_key="key", tts_region="test-region")
    assert isinstance(get_translation_provider(settings), AzureTranslationProvider)


def test_get_translation_provider_requires_azure_credentials():
    with pytest.raises(ValueError, match="AZURE_TRANSLATION_KEY"):
        get_translation_provider(Settings(azure_translation_key="", tts_region="test-region"))

    with pytest.raises(ValueError, match="TTS_REGION"):
        get_translation_provider(Settings(azure_translation_key="key", tts_region=""))









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
    await translation_repo.save_translation("site1", "/home", "t1", "hi", "Namaste", "AzureTranslationProvider")

    docs = await translation_repo.find_by_keys("site1", ["t1"])
    assert len(docs) == 1
    assert docs[0]["translations"]["hi"]["text"] == "Namaste"
    assert docs[0]["translations"]["hi"]["provider"] == "AzureTranslationProvider"


async def _seeded_translation_id(translation_repo, translation_service):
    await translation_service.extract_items(
        "site1",
        [{"key": "t1", "text": "Hello", "route": "/home", "source_lang": "en"}],
    )
    docs = await translation_repo.find_by_route("site1", "/home")
    return str(docs[0]["_id"])


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
    await translation_service.approve_translation(id1, TENANT, "hi", "reviewer@example.com")

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
    await translation_service.approve_translation(str(t2["_id"]), TENANT, "ta", "rev@example.com")

    res = await translation_service.bulk_approve_pending("site1", TENANT, "rev@example.com")
    assert res == {"approved": 2, "skipped": 1, "failed": 0}

    docs = {d["key"]: d for d in await translation_repo.find_by_route("site1", "/h")}
    assert docs["t1"]["translations"]["hi"]["status"] == "approved"
    assert docs["t1"]["translations"]["mr"]["status"] == "approved"
    assert docs["t2"]["translations"]["ta"]["status"] == "approved"

    versions = {
        d["key"]: await translation_service.get_version_history(str(d["_id"]), TENANT) for d in docs.values()
    }
    assert len(versions["t1"]) == 2
    assert {v["version"] for v in versions["t1"]} == {1, 2}
    v1, v2 = sorted(versions["t1"], key=lambda v: v["version"])
    assert v1["translations"]["hi"]["status"] == "pending"
    assert v2["translations"]["hi"]["status"] == "approved"
    assert v2["translations"]["mr"]["status"] == "pending"
    assert len(versions["t2"]) == 1

    audit = await translation_service.get_audit_trail("site1", TENANT, route="/h")
    approved_entries = [a for a in audit if a["action"] == "approved"]
    assert len(approved_entries) == 3  # t2/ta from the manual approve above + t1/hi + t1/mr from bulk


async def test_bulk_approve_pending_skips_rejected(translation_repo, translation_service):
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")
    await translation_repo.upsert_source("site1", "/h", "t2", "en", "World")
    await translation_repo.save_translation("site1", "/h", "t2", "hi", "[hi] World", "P")
    t2 = next(d for d in await translation_repo.find_by_route("site1", "/h") if d["key"] == "t2")
    await translation_repo.reject_translation(str(t2["_id"]), "hi", "rev@example.com", "needs work")

    res = await translation_service.bulk_approve_pending("site1", TENANT, "rev@example.com")
    assert res == {"approved": 1, "skipped": 1, "failed": 0}

    docs = {d["key"]: d for d in await translation_repo.find_by_route("site1", "/h")}
    assert docs["t1"]["translations"]["hi"]["status"] == "approved"
    assert docs["t2"]["translations"]["hi"]["status"] == "rejected"


async def test_bulk_approve_pending_respects_lang_filter(translation_repo, translation_service):
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")
    await translation_repo.save_translation("site1", "/h", "t1", "mr", "[mr] Hello", "P")

    res = await translation_service.bulk_approve_pending("site1", TENANT, "rev@example.com", lang="hi")
    assert res == {"approved": 1, "skipped": 0, "failed": 0}

    doc = (await translation_repo.find_by_route("site1", "/h"))[0]
    assert doc["translations"]["hi"]["status"] == "approved"
    assert doc["translations"]["mr"]["status"] == "pending"


async def test_bulk_approve_pending_respects_route_filter(translation_repo, translation_service):
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")
    await translation_repo.upsert_source("site1", "/other", "t2", "en", "World")
    await translation_repo.save_translation("site1", "/other", "t2", "hi", "[hi] World", "P")

    res = await translation_service.bulk_approve_pending("site1", TENANT, "rev@example.com", route="/h")
    assert res == {"approved": 1, "skipped": 0, "failed": 0}

    other_doc = (await translation_repo.find_by_route("site1", "/other"))[0]
    assert other_doc["translations"]["hi"]["status"] == "pending"


async def test_bulk_approve_pending_raises_for_cross_tenant_site(translation_repo, translation_service):
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")

    with pytest.raises(NotFoundError):
        await translation_service.bulk_approve_pending("site1", "other-tenant", "rev@example.com")

    doc = (await translation_repo.find_by_route("site1", "/h"))[0]
    assert doc["translations"]["hi"]["status"] == "pending"


async def test_bulk_approve_pending_handles_large_batch(translation_repo, translation_service):
    for i in range(150):
        key = f"t{i}"
        await translation_repo.upsert_source("site1", "/h", key, "en", f"Hello {i}")
        await translation_repo.save_translation("site1", "/h", key, "hi", f"[hi] Hello {i}", "P")

    res = await translation_service.bulk_approve_pending("site1", TENANT, "rev@example.com")
    assert res == {"approved": 150, "skipped": 0, "failed": 0}

    docs = await translation_repo.find_by_route("site1", "/h")
    assert all(d["translations"]["hi"]["status"] == "approved" for d in docs)

    audit = await translation_service.get_audit_trail("site1", TENANT, route="/h", limit=200)
    assert len([a for a in audit if a["action"] == "approved"]) == 150


async def test_bulk_approve_pending_surfaces_partial_write_failures(
    translation_repo, translation_service, monkeypatch
):
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")
    await translation_repo.upsert_source("site1", "/h", "t2", "en", "World")
    await translation_repo.save_translation("site1", "/h", "t2", "hi", "[hi] World", "P")

    from pymongo.errors import BulkWriteError

    async def _boom(_ops):
        raise BulkWriteError({"writeErrors": [{"index": 0, "errmsg": "boom"}]})

    monkeypatch.setattr(translation_service._repo, "bulk_approve", _boom)

    res = await translation_service.bulk_approve_pending("site1", TENANT, "rev@example.com")
    assert res["failed"] == 1
    assert res["approved"] == 1
    assert res["skipped"] == 0


async def test_reject_translation_after_approval_flips_status_and_metadata(
    translation_repo, translation_service
):
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")
    t1 = next(d for d in await translation_repo.find_by_route("site1", "/h") if d["key"] == "t1")
    translation_id = str(t1["_id"])

    await translation_service.approve_translation(translation_id, TENANT, "hi", "rev@example.com")
    approved_doc = await translation_repo.find_by_id(translation_id)
    assert approved_doc["translations"]["hi"]["status"] == "approved"

    await translation_service.reject_translation(
        translation_id, TENANT, "hi", "rev2@example.com", "changed my mind"
    )
    doc = await translation_repo.find_by_id(translation_id)

    entry = doc["translations"]["hi"]
    assert entry["status"] == "rejected"
    assert entry["rejected_by"] == "rev2@example.com"
    assert entry["rejection_reason"] == "changed my mind"
    assert entry["rejected_at"] is not None
    assert doc["status"] == "rejected"


async def test_approve_reject_cycle_is_fully_reversible_and_repeatable(
    translation_repo, translation_service
):
    await translation_repo.upsert_source("site1", "/h", "t1", "en", "Hello")
    await translation_repo.save_translation("site1", "/h", "t1", "hi", "[hi] Hello", "P")
    t1 = next(d for d in await translation_repo.find_by_route("site1", "/h") if d["key"] == "t1")
    translation_id = str(t1["_id"])

    async def status() -> str:
        doc = await translation_repo.find_by_id(translation_id)
        return doc["translations"]["hi"]["status"]

    await translation_service.approve_translation(translation_id, TENANT, "hi", "rev@example.com")
    assert await status() == "approved"

    await translation_service.reject_translation(translation_id, TENANT, "hi", "rev@example.com", "r1")
    assert await status() == "rejected"

    await translation_service.approve_translation(translation_id, TENANT, "hi", "rev@example.com")
    assert await status() == "approved"

    await translation_service.reject_translation(translation_id, TENANT, "hi", "rev@example.com", "r2")
    assert await status() == "rejected"

    await translation_service.approve_translation(translation_id, TENANT, "hi", "rev@example.com")
    assert await status() == "approved"


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
    await mock_db["websites"].insert_many(
        [{"site_id": "site1", "status": "Active", "domain": "acme.example", "languages": [{"code": "hi", "enabled": True}]}]
    )
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
    )
    with pytest.raises(ValidationError):
        await bound_service.runtime_translate("site1", "/h", "xx-not-a-lang")


async def test_lang_enabled_check_is_scoped_per_site(mock_db, fake_provider):
    await mock_db["websites"].insert_many(
        [
            {"site_id": "site_with_hi", "status": "Active", "languages": [{"code": "hi", "enabled": True}]},
            {"site_id": "site_without_hi", "status": "Active", "languages": [{"code": "bn", "enabled": True}]},
        ]
    )
    service = TranslationService(mock_db, lambda: fake_provider)

    await service.extract_items(
        "site_with_hi", [{"key": "t1", "text": "Hello", "route": "/h", "source_lang": "en"}]
    )
    await service.extract_items(
        "site_without_hi", [{"key": "t1", "text": "Hello", "route": "/h", "source_lang": "en"}]
    )
    from app.platform.error_handling import ValidationError

    result = await service.runtime_translate("site_with_hi", "/h", "hi")
    assert result == {"t1": "Hello"}

    with pytest.raises(ValidationError):
        await service.runtime_translate("site_without_hi", "/h", "hi")


async def test_lang_present_but_not_enabled_is_rejected(mock_db, fake_provider):
    await mock_db["websites"].insert_many(
        [{"site_id": "site1", "status": "Active", "languages": [{"code": "hi", "enabled": False}]}]
    )
    service = TranslationService(mock_db, lambda: fake_provider)

    await service.extract_items(
        "site1", [{"key": "t1", "text": "Hello", "route": "/h", "source_lang": "en"}]
    )
    from app.platform.error_handling import ValidationError

    with pytest.raises(ValidationError):
        await service.runtime_translate("site1", "/h", "hi")


async def test_generate_for_review_translation_memory_reuse_still_auto_approves(
    translation_repo, translation_service, fake_provider
):
    id1 = await _seeded_translation_id(translation_repo, translation_service)
    await translation_service.generate_for_review("site1", TENANT, "/home", "hi")
    await translation_service.approve_translation(id1, TENANT, "hi", "reviewer@example.com")
    assert len(fake_provider.calls) == 1

    await translation_service.extract_items(
        "site1", [{"key": "t2", "text": "Hello", "route": "/about", "source_lang": "en"}]
    )
    result = await translation_service.generate_for_review("site1", TENANT, "/about", "hi")

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


