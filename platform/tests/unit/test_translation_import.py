from __future__ import annotations

import pytest
from pymongo.errors import BulkWriteError

from app.platform.error_handling import NotFoundError, ValidationError
from app.repositories.translation_repository import TranslationRepository
from app.services.sdk_rolling_hash import sdk_rolling_hash
from app.services.translation_service import TranslationService
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "tenant-1"
ACTOR = "importer@example.com"
SITE = "site1"


@pytest.fixture
def mock_db():
    return AsyncMongoMockClient()["test_import"]


@pytest.fixture
def repo(mock_db):
    return TranslationRepository(mock_db)


@pytest.fixture
async def service(mock_db):
    await mock_db["websites"].insert_many(
        [
            {
                "site_id": SITE,
                "status": "Active",
                "tenant_id": TENANT,
                "languages": [{"code": "kn", "enabled": True}, {"code": "te", "enabled": True}, {"code": "hi", "enabled": False}],
            },
            {
                "site_id": "inactive",
                "status": "Inactive",
                "tenant_id": TENANT,
                "languages": [{"code": "kn", "enabled": True}],
            },
        ]
    )
    return TranslationService(mock_db, lambda: None)


def _row(source: str, text: str, route: str = "/", key: str | None = None) -> dict[str, str]:
    return {"route": route, "key": key if key is not None else sdk_rolling_hash(source), "source": source, "text": text}


async def _seed(repo, source="Hello World", route="/", lang=None, text="", status=None, **extra):
    key = sdk_rolling_hash(source)
    await repo.upsert_source(SITE, route, key, "en", source)
    if lang:
        await repo.save_translation(SITE, route, key, lang, text, "AzureTranslationProvider")
        if status == "approved":
            doc = (await repo.find_by_keys(SITE, [key]))[0]
            await repo.approve_translation(str(doc["_id"]), lang, "rev", version=1)
        elif status == "rejected":
            doc = (await repo.find_by_keys(SITE, [key]))[0]
            await repo.reject_translation(str(doc["_id"]), lang, "rev", "bad")
    return key


async def _doc(repo, key, route="/"):
    return next(d for d in await repo.find_by_keys(SITE, [key]) if d["route"] == route)


async def _import(service, rows, lang="kn", **kwargs):
    return await service.import_translations(SITE, TENANT, ACTOR, lang, rows, **kwargs)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Hello World", "te9jc70"),
        ("ಹಲೋ", "t1xbde"),
        ("Welcome, friend", "tyjee6s"),
        ('Say "hi" now', "t6x23p2"),
        ("Multi\nline text", "twdvimw"),
        ("😀 emoji", "tq0alrr"),
        ("తెలుగు వచనం", "ty2lko4"),
        ("", "t0"),
        ("a", "t2p"),
        ("x" * 300, "tt2j4zk"),
        ("Learning that reaches every child.", "tualgr1"),
    ],
)
def test_sdk_rolling_hash_matches_sdk_js_vectors(text, expected):
    assert sdk_rolling_hash(text) == expected


def test_sdk_rolling_hash_differs_from_sha1_helper():
    from app.services.sdk_hash import sdk_hash_text

    assert sdk_rolling_hash("Hello World") != sdk_hash_text("Hello World")


async def test_import_updates_existing_row_as_pending_by_default(service, repo):
    key = await _seed(repo, lang="kn", text="old", status="approved")

    res = await _import(service, [_row("Hello World", "ಹಲೋ ವರ್ಲ್ಡ್")])

    assert res == {"updated": 1, "created": 0, "unchanged": 0, "skipped_blank": 0, "failed": 0, "errors": []}
    entry = (await _doc(repo, key))["translations"]["kn"]
    assert entry["text"] == "ಹಲೋ ವರ್ಲ್ಡ್"
    assert entry["status"] == "pending"
    assert entry["provider"] == "Import"
    assert "approved_by" not in entry


async def test_import_creates_unknown_key_as_pending_row(service, repo):
    res = await _import(service, [_row("Brand new", "ಹೊಸ", route="/new")])

    assert res["created"] == 1 and res["failed"] == 0
    doc = await _doc(repo, sdk_rolling_hash("Brand new"), "/new")
    assert doc["site_id"] == SITE
    assert doc["source_text"] == "Brand new"
    assert doc["source_lang"] == "en"
    assert doc["translations"]["kn"]["text"] == "ಹೊಸ"
    assert doc["translations"]["kn"]["status"] == "pending"
    assert doc["translations"]["kn"]["created_by"] == ACTOR
    assert doc.get("status") is None


async def test_import_rejects_key_that_is_not_the_sdk_hash_of_source(service, repo):
    res = await _import(service, [_row("Brand new", "ಹೊಸ", key="tdeadbeef")])

    assert res["created"] == 0 and res["failed"] == 1
    assert res["errors"] == [{"row": 1, "route": "/", "key": "tdeadbeef", "reason": "key_mismatch"}]
    assert await repo.find_by_route(SITE, "/") == []


async def test_import_hashes_the_trimmed_source_for_new_rows(service, repo):
    res = await _import(service, [{"route": "/", "key": sdk_rolling_hash("Padded"), "source": "  Padded \n", "text": "x"}])

    assert res["created"] == 1
    assert (await _doc(repo, sdk_rolling_hash("Padded")))["source_text"] == "Padded"


async def test_import_never_overwrites_source_and_fails_on_mismatch(service, repo):
    key = await _seed(repo)

    res = await _import(service, [{"route": "/", "key": key, "source": "A different source", "text": "x"}])

    assert res["failed"] == 1 and res["errors"][0]["reason"] == "source_mismatch"
    doc = await _doc(repo, key)
    assert doc["source_text"] == "Hello World"
    assert doc["translations"] == {}


async def test_import_source_comparison_tolerates_crlf_from_excel(service, repo):
    source = "Line one\nLine two"
    key = await _seed(repo, source=source)

    res = await _import(service, [{"route": "/", "key": key, "source": "Line one\r\nLine two", "text": "ಒಂದು\r\nಎರಡು"}])

    assert res["updated"] == 1
    assert (await _doc(repo, key))["translations"]["kn"]["text"] == "ಒಂದು\nಎರಡು"


@pytest.mark.parametrize(
    ("row", "reason"),
    [
        ({"route": "/", "key": "", "source": "a", "text": "x"}, "missing_key"),
        ({"route": "", "key": "t2p", "source": "a", "text": "x"}, "missing_route"),
        ({"route": "about", "key": "t2p", "source": "a", "text": "x"}, "invalid_route"),
        ({"route": "/", "key": "t2p", "source": "", "text": "x"}, "missing_source"),
        ({"route": "/", "key": "t2p", "source": "a", "text": "x" * 5001}, "text_too_long"),
    ],
)
async def test_import_reports_row_level_validation_errors(service, row, reason):
    res = await _import(service, [row])

    assert res["failed"] == 1
    assert res["errors"][0]["reason"] == reason
    assert res["errors"][0]["row"] == 1


async def test_import_fails_duplicate_route_key_rows_and_keeps_the_first(service, repo):
    key = await _seed(repo)

    res = await _import(service, [_row("Hello World", "first"), _row("Hello World", "second")])

    assert res["updated"] == 1
    assert res["errors"] == [{"row": 2, "route": "/", "key": key, "reason": "duplicate_row"}]
    assert (await _doc(repo, key))["translations"]["kn"]["text"] == "first"


async def test_import_same_key_on_two_routes_is_two_rows(service, repo):
    await _seed(repo, route="/")
    await _seed(repo, route="/about")

    res = await _import(service, [_row("Hello World", "home", route="/"), _row("Hello World", "about", route="/about")])

    assert res["updated"] == 2
    key = sdk_rolling_hash("Hello World")
    assert (await _doc(repo, key, "/"))["translations"]["kn"]["text"] == "home"
    assert (await _doc(repo, key, "/about"))["translations"]["kn"]["text"] == "about"


async def test_import_rejects_a_language_that_is_not_enabled_for_the_site(service, repo):
    key = await _seed(repo)

    with pytest.raises(ValidationError):
        await _import(service, [_row("Hello World", "x")], lang="hi")
    with pytest.raises(ValidationError):
        await _import(service, [_row("Hello World", "x")], lang="zz")
    assert (await _doc(repo, key))["translations"] == {}


async def test_import_requires_an_active_site(service, mock_db):
    with pytest.raises(NotFoundError):
        await service.import_translations("inactive", TENANT, ACTOR, "kn", [_row("Hello World", "x")])


async def test_import_denies_another_tenants_site(service, repo):
    key = await _seed(repo)

    with pytest.raises(NotFoundError):
        await service.import_translations(SITE, "other-tenant", ACTOR, "kn", [_row("Hello World", "x")])
    assert (await _doc(repo, key))["translations"] == {}


async def test_import_unknown_site_is_not_found(service):
    with pytest.raises(NotFoundError):
        await service.import_translations("nope", TENANT, ACTOR, "kn", [])


async def test_import_blank_is_skipped_when_overwrite_is_off(service, repo):
    key = await _seed(repo, lang="kn", text="keep me")

    res = await _import(service, [_row("Hello World", "   ")])

    assert res["skipped_blank"] == 1 and res["updated"] == 0
    assert (await _doc(repo, key))["translations"]["kn"]["text"] == "keep me"


async def test_import_blank_for_unknown_key_never_creates_a_row(service, repo):
    res = await _import(service, [_row("Brand new", "")], overwrite_blank=True)

    assert res["skipped_blank"] == 1 and res["created"] == 0
    assert await repo.find_by_route(SITE, "/") == []


async def test_import_blank_removes_the_language_entry_when_overwrite_is_on(service, repo):
    key = await _seed(repo, lang="kn", text="old")
    await repo.save_translation(SITE, "/", key, "te", "te text", "P")

    res = await _import(service, [_row("Hello World", "")], overwrite_blank=True)

    assert res["updated"] == 1
    translations = (await _doc(repo, key))["translations"]
    assert "kn" not in translations
    assert translations["te"]["text"] == "te text"


async def test_import_blank_over_nothing_is_unchanged_when_overwrite_is_on(service, repo):
    await _seed(repo)

    res = await _import(service, [_row("Hello World", "")], overwrite_blank=True)

    assert res["unchanged"] == 1 and res["updated"] == 0


async def test_import_identical_text_is_unchanged_and_keeps_approval(service, repo):
    key = await _seed(repo, lang="kn", text="same", status="approved")

    res = await _import(service, [_row("Hello World", "same")])

    assert res["unchanged"] == 1
    assert (await _doc(repo, key))["translations"]["kn"]["status"] == "approved"


async def test_import_only_touches_the_selected_language(service, repo):
    key = await _seed(repo, lang="kn", text="kn old")
    await repo.save_translation(SITE, "/", key, "te", "te old", "P")

    await _import(service, [_row("Hello World", "kn new")], lang="kn")

    translations = (await _doc(repo, key))["translations"]
    assert translations["kn"]["text"] == "kn new"
    assert translations["te"]["text"] == "te old"
    assert translations["te"]["status"] == "pending"


async def test_import_approved_state_approves_with_version_and_audit(service, repo):
    key = await _seed(repo, lang="kn", text="old")
    doc = await _doc(repo, key)

    res = await _import(service, [_row("Hello World", "new text")], state="approved")

    assert res["updated"] == 1
    updated = await _doc(repo, key)
    entry = updated["translations"]["kn"]
    assert entry["text"] == "new text"
    assert entry["status"] == "approved"
    assert entry["approved_by"] == ACTOR
    assert updated["status"] == "approved"
    assert updated["version"] == 1
    versions = await service.get_version_history(str(doc["_id"]), TENANT)
    assert [v["version"] for v in versions] == [1]
    assert versions[0]["translations"]["kn"]["text"] == "new text"
    actions = [a["action"] for a in await service.get_audit_trail(SITE, TENANT)]
    assert sorted(actions) == ["approved", "imported"]


async def test_import_approved_state_creates_and_versions_new_rows(service, repo):
    res = await _import(service, [_row("Brand new", "ಹೊಸ", route="/new")], state="approved")

    assert res["created"] == 1
    key = sdk_rolling_hash("Brand new")
    doc = await _doc(repo, key, "/new")
    assert doc["translations"]["kn"]["status"] == "approved"
    assert doc["status"] == "approved"
    versions = await service.get_version_history(str(doc["_id"]), TENANT)
    assert len(versions) == 1 and versions[0]["version"] == 1


async def test_import_pending_state_demotes_changed_approved_text_and_clears_rejection(service, repo):
    approved_key = await _seed(repo, "Approved one", lang="kn", text="old a", status="approved")
    rejected_key = await _seed(repo, "Rejected one", lang="kn", text="old r", status="rejected")

    await _import(service, [_row("Approved one", "new a"), _row("Rejected one", "new r")], state="pending")

    approved = (await _doc(repo, approved_key))["translations"]["kn"]
    rejected = (await _doc(repo, rejected_key))["translations"]["kn"]
    assert approved["status"] == "pending" and "approved_by" not in approved
    assert rejected["status"] == "pending"
    assert "rejected_by" not in rejected and "rejection_reason" not in rejected


async def test_import_keep_state_updates_text_and_preserves_status(service, repo):
    approved_key = await _seed(repo, "Approved one", lang="kn", text="old a", status="approved")
    rejected_key = await _seed(repo, "Rejected one", lang="kn", text="old r", status="rejected")
    pending_key = await _seed(repo, "Pending one", lang="kn", text="old p")
    fresh_key = await _seed(repo, "Fresh one")

    res = await _import(
        service,
        [_row("Approved one", "new a"), _row("Rejected one", "new r"), _row("Pending one", "new p"), _row("Fresh one", "new f")],
        state="keep",
    )

    assert res["updated"] == 4
    approved = (await _doc(repo, approved_key))["translations"]["kn"]
    assert (approved["text"], approved["status"]) == ("new a", "approved")
    rejected = (await _doc(repo, rejected_key))["translations"]["kn"]
    assert (rejected["text"], rejected["status"]) == ("new r", "rejected")
    pending = (await _doc(repo, pending_key))["translations"]["kn"]
    assert (pending["text"], pending["status"]) == ("new p", "pending")
    fresh = (await _doc(repo, fresh_key))["translations"]["kn"]
    assert (fresh["text"], fresh["status"]) == ("new f", "pending")


async def test_import_partial_write_failure_reports_the_failed_rows(service, repo, monkeypatch):
    await _seed(repo, "First")
    await _seed(repo, "Second")

    async def _boom(ops):
        survivors = [op for i, op in enumerate(ops) if i != 1]
        await real_write(survivors)
        raise BulkWriteError({"writeErrors": [{"index": 1, "errmsg": "boom"}]})

    real_write = service._repo.bulk_write
    monkeypatch.setattr(service._repo, "bulk_write", _boom)

    res = await _import(service, [_row("First", "one"), _row("Second", "two")])

    assert res["updated"] == 1 and res["failed"] == 1
    assert res["errors"] == [{"row": 2, "route": "/", "key": sdk_rolling_hash("Second"), "reason": "write_failed"}]
    assert (await _doc(repo, sdk_rolling_hash("First")))["translations"]["kn"]["text"] == "one"
    assert (await _doc(repo, sdk_rolling_hash("Second")))["translations"] == {}
    audit = await service.get_audit_trail(SITE, TENANT)
    assert [a["key"] for a in audit] == [sdk_rolling_hash("First")]


async def test_import_mixed_rows_report_each_outcome(service, repo):
    await _seed(repo, "Existing")
    await _seed(repo, "Blank one")

    res = await _import(
        service,
        [
            _row("Existing", "ok"),
            _row("Brand new", "created", route="/n"),
            _row("Blank one", ""),
            _row("Nope", "x", key="tbad"),
            {"route": "/", "key": "", "source": "x", "text": "x"},
        ],
    )

    assert (res["updated"], res["created"], res["skipped_blank"], res["failed"]) == (1, 1, 1, 2)
    assert [(e["row"], e["reason"]) for e in res["errors"]] == [(4, "key_mismatch"), (5, "missing_key")]


async def test_imported_translations_are_not_counted_as_ai_generated(service, repo):
    await _import(service, [_row("Brand new", "ಹೊಸ", route="/new")], state="approved")

    analytics = await repo.get_analytics(SITE)
    assert analytics["ai_generated_translations"] == 0
    assert analytics["translation_memory_reused_translations"] == 0
    assert analytics["approved_translations"] == 1


JS_WHITESPACE_CODE_POINTS = {
    0x9, 0xA, 0xB, 0xC, 0xD, 0x20, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
    0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF,
}


def test_js_trim_matches_javascript_trim_for_every_bmp_code_point():
    from app.services.sdk_rolling_hash import js_trim

    mismatches = [
        cp
        for cp in range(0x10000)
        if not 0xD800 <= cp <= 0xDFFF and (js_trim(chr(cp)) == "") != (cp in JS_WHITESPACE_CODE_POINTS)
    ]

    assert mismatches == []


def test_js_trim_differs_from_python_strip_where_it_matters():
    from app.services.sdk_rolling_hash import js_trim

    nel, fs, bom = chr(0x85), chr(0x1C), chr(0xFEFF)
    assert js_trim(nel + "x" + nel) == nel + "x" + nel
    assert js_trim(fs + "x" + fs) == fs + "x" + fs
    assert js_trim(bom + "x" + bom) == "x"
    assert js_trim(chr(0xA0) + "x" + chr(0x2028)) == "x"


async def test_import_new_row_key_follows_javascript_trim_not_python_strip(service, repo):
    nel = chr(0x85)
    edged = nel + "Edged" + nel
    bom_source = chr(0xFEFF) + "Bom text"

    res = await _import(
        service,
        [
            {"route": "/", "key": sdk_rolling_hash(edged), "source": edged, "text": "a"},
            {"route": "/", "key": sdk_rolling_hash("Bom text"), "source": bom_source, "text": "b"},
            {"route": "/", "key": sdk_rolling_hash(bom_source), "source": bom_source, "text": "c"},
        ],
    )

    assert res["created"] == 2
    assert res["errors"] == [{"row": 3, "route": "/", "key": sdk_rolling_hash(bom_source), "reason": "key_mismatch"}]
    assert (await _doc(repo, sdk_rolling_hash(edged)))["source_text"] == edged
    assert (await _doc(repo, sdk_rolling_hash("Bom text")))["source_text"] == "Bom text"


@pytest.mark.parametrize(
    "route",
    [
        "/about?x=1",
        "/about#frag",
        "/a b",
        "/a\tb",
        "/a\nb",
        " /about",
        "/about ",
        "about",
        "/caf" + chr(0xE9),
        "/a{b}",
        '/a"b',
        "/a<b>",
        "/a^b",
        "/a`b",
        "/a" + chr(92) + "b",
        "/a/../b",
        "/a/./b",
        "/" + "x" * 2048,
    ],
)
async def test_import_rejects_routes_that_window_location_pathname_can_never_return(service, repo, route):
    res = await _import(service, [_row("Hello World", "x", route=route)])

    assert res["created"] == 0 and res["failed"] == 1
    assert res["errors"][0]["reason"] == "invalid_route"
    assert await repo.find_by_keys(SITE, [sdk_rolling_hash("Hello World")]) == []


@pytest.mark.parametrize(
    "route",
    ["/", "/about", "/about/", "//evil", "/product-category/pencils/", "/%E0%B2%95/x", "/a|b", "/a[1]", "/" + "x" * 2047],
)
async def test_import_accepts_exact_url_pathnames_including_leading_double_slash(service, repo, route):
    res = await _import(service, [_row("Hello World", "x", route=route)])

    assert res["created"] == 1 and res["failed"] == 0
    assert (await _doc(repo, sdk_rolling_hash("Hello World"), route))["route"] == route


async def test_import_treats_a_trailing_slash_as_a_different_route(service, repo):
    await _seed(repo, route="/about")
    await _seed(repo, route="/about/")

    res = await _import(service, [_row("Hello World", "no slash", route="/about"), _row("Hello World", "slash", route="/about/")])

    assert res["updated"] == 2
    key = sdk_rolling_hash("Hello World")
    assert (await _doc(repo, key, "/about"))["translations"]["kn"]["text"] == "no slash"
    assert (await _doc(repo, key, "/about/"))["translations"]["kn"]["text"] == "slash"

    only_slashless = await _import(service, [_row("Hello World", "changed", route="/about")])
    assert only_slashless["updated"] == 1
    assert (await _doc(repo, key, "/about/"))["translations"]["kn"]["text"] == "slash"


async def test_import_does_not_silently_trim_the_route_to_make_it_valid(service, repo):
    key = await _seed(repo, route="/about")

    res = await _import(service, [_row("Hello World", "x", route=" /about")])

    assert res["errors"][0]["reason"] == "invalid_route"
    assert (await _doc(repo, key, "/about"))["translations"] == {}


@pytest.mark.parametrize("source", ["", "   ", "\n\t ", chr(0xFEFF) + chr(0xA0)])
async def test_import_rejects_blank_or_whitespace_only_source(service, source):
    res = await _import(service, [{"route": "/", "key": "t0", "source": source, "text": "x"}])

    assert res["errors"][0]["reason"] == "missing_source"


async def test_import_rejects_oversized_source_and_accepts_the_limit(service, repo):
    too_long = "x" * 5001
    at_limit = "y" * 5000

    res = await _import(service, [_row(too_long, "a"), _row(at_limit, "b")])

    assert [(e["row"], e["reason"]) for e in res["errors"]] == [(1, "source_too_long")]
    assert res["created"] == 1
    assert (await _doc(repo, sdk_rolling_hash(at_limit)))["translations"]["kn"]["text"] == "b"


async def test_import_keep_state_with_overwrite_blank_still_clears_the_entry(service, repo):
    approved_key = await _seed(repo, "Approved one", lang="kn", text="live", status="approved")
    await _seed(repo, "Empty one")

    res = await _import(
        service, [_row("Approved one", ""), _row("Empty one", "")], state="keep", overwrite_blank=True
    )

    assert res["updated"] == 1 and res["unchanged"] == 1
    assert "kn" not in (await _doc(repo, approved_key))["translations"]


async def test_import_approved_over_rejected_approves_and_clears_rejection(service, repo):
    key = await _seed(repo, lang="kn", text="old", status="rejected")
    doc = await _doc(repo, key)

    res = await _import(service, [_row("Hello World", "fixed")], state="approved")

    assert res["updated"] == 1
    entry = (await _doc(repo, key))["translations"]["kn"]
    assert entry["text"] == "fixed" and entry["status"] == "approved"
    assert entry["approved_by"] == ACTOR
    assert not {"rejected_by", "rejected_at", "rejection_reason"} & set(entry)
    assert len(await service.get_version_history(str(doc["_id"]), TENANT)) == 1


async def test_find_by_route_keys_returns_only_the_exact_route_and_key_pairs(repo):
    for route in ("/a", "/b"):
        for key in ("k1", "k2"):
            await repo.upsert_source(SITE, route, key, "en", f"{route}-{key}")
    await repo.upsert_source("other-site", "/a", "k1", "en", "other site")

    docs = await repo.find_by_route_keys(SITE, [("/a", "k1"), ("/b", "k2")])

    assert sorted((d["route"], d["key"]) for d in docs) == [("/a", "k1"), ("/b", "k2")]
    assert await repo.find_by_route_keys(SITE, []) == []


async def test_find_by_route_keys_batches_large_identity_lists(repo, monkeypatch):
    monkeypatch.setattr("app.repositories.translation_repository.ROUTE_KEY_QUERY_BATCH", 2)
    identities = [(f"/p{i}", f"k{i}") for i in range(5)]
    for route, key in identities:
        await repo.upsert_source(SITE, route, key, "en", key)
    await repo.upsert_source(SITE, "/p0", "k1", "en", "cross product that must not be returned")

    docs = await repo.find_by_route_keys(SITE, identities)

    assert sorted((d["route"], d["key"]) for d in docs) == sorted(identities)


async def test_import_resolves_rows_by_exact_route_and_key_without_a_site_wide_key_lookup(
    service, repo, monkeypatch
):
    await _seed(repo, route="/a")
    await _seed(repo, route="/b")
    seen = []
    real = service._repo.find_by_route_keys

    async def spy(site_id, identities):
        seen.append(list(identities))
        return await real(site_id, identities)

    async def forbidden(*_args, **_kwargs):
        raise AssertionError("import must not look rows up by key alone")

    monkeypatch.setattr(service._repo, "find_by_route_keys", spy)
    monkeypatch.setattr(service._repo, "find_by_keys", forbidden)
    key = sdk_rolling_hash("Hello World")

    res = await _import(service, [_row("Hello World", "a", route="/a"), _row("Hello World", "b", route="/b")])

    assert res["updated"] == 2
    assert seen == [[("/a", key), ("/b", key)]]


async def test_import_for_a_route_without_the_row_creates_it_and_leaves_the_same_key_on_other_routes(service, repo):
    await _seed(repo, route="/a", lang="kn", text="a original")
    key = sdk_rolling_hash("Hello World")

    res = await _import(service, [_row("Hello World", "b new", route="/b")])

    assert res["created"] == 1 and res["updated"] == 0
    assert (await _doc(repo, key, "/a"))["translations"]["kn"]["text"] == "a original"
    assert (await _doc(repo, key, "/b"))["translations"]["kn"]["text"] == "b new"


async def test_same_key_with_different_sources_on_two_routes_is_resolved_independently(service, repo):
    colliding_key = sdk_rolling_hash("Aa")
    assert colliding_key == sdk_rolling_hash("BB")
    await repo.upsert_source(SITE, "/a", colliding_key, "en", "Aa")
    await repo.upsert_source(SITE, "/b", colliding_key, "en", "BB")

    res = await _import(
        service,
        [
            {"route": "/a", "key": colliding_key, "source": "Aa", "text": "for a"},
            {"route": "/b", "key": colliding_key, "source": "BB", "text": "for b"},
        ],
    )

    assert res["updated"] == 2 and res["failed"] == 0
    assert (await _doc(repo, colliding_key, "/a"))["translations"]["kn"]["text"] == "for a"
    assert (await _doc(repo, colliding_key, "/b"))["translations"]["kn"]["text"] == "for b"

    wrong = await _import(service, [{"route": "/a", "key": colliding_key, "source": "BB", "text": "x"}])

    assert wrong["errors"][0]["reason"] == "source_mismatch"
    assert (await _doc(repo, colliding_key, "/a"))["translations"]["kn"]["text"] == "for a"
    assert (await _doc(repo, colliding_key, "/b"))["translations"]["kn"]["text"] == "for b"


async def test_canonical_source_is_used_for_the_hash_check_and_is_what_a_new_row_stores(service, repo):
    canonical = "Hello" + chr(10) + "World"
    messy = chr(13) + chr(10) + "  " + "Hello" + chr(13) + chr(10) + "World " + chr(10) + chr(10)

    res = await _import(service, [{"route": "/", "key": sdk_rolling_hash(canonical), "source": messy, "text": "x"}])

    assert res["created"] == 1
    assert (await _doc(repo, sdk_rolling_hash(canonical)))["source_text"] == canonical


async def test_a_key_hashed_from_the_raw_untrimmed_crlf_source_is_rejected(service, repo):
    messy = chr(13) + chr(10) + "  Hello" + chr(13) + chr(10) + "World "

    res = await _import(service, [{"route": "/", "key": sdk_rolling_hash(messy), "source": messy, "text": "x"}])

    assert res["errors"] == [{"row": 1, "route": "/", "key": sdk_rolling_hash(messy), "reason": "key_mismatch"}]
    assert await repo.find_by_route(SITE, "/") == []


@pytest.mark.parametrize(
    ("stored", "csv_source"),
    [
        ("Line one" + chr(13) + chr(10) + "Line two", "Line one" + chr(10) + "Line two"),
        ("Line one" + chr(10) + "Line two", "Line one" + chr(13) + chr(10) + "Line two"),
        ("Line one" + chr(13) + "Line two", "Line one" + chr(10) + "Line two"),
        ("  Hello World  ", "Hello World"),
        ("Hello World", chr(9) + chr(160) + "Hello World" + chr(10) + chr(32)),
        (chr(65279) + "Hello World", "Hello World"),
    ],
)
async def test_existing_source_comparison_uses_the_same_canonical_form_and_never_rewrites_the_stored_source(
    service, repo, stored, csv_source
):
    await repo.upsert_source(SITE, "/", "tstored", "en", stored)

    res = await _import(service, [{"route": "/", "key": "tstored", "source": csv_source, "text": "ok"}])

    assert res["updated"] == 1 and res["failed"] == 0
    doc = await _doc(repo, "tstored")
    assert doc["source_text"] == stored
    assert doc["translations"]["kn"]["text"] == "ok"


@pytest.mark.parametrize(
    ("stored", "csv_source"),
    [
        ("a  b", "a b"),
        ("Line one" + chr(10) + "Line two", "Line one Line two"),
        ("Hello", "hello"),
    ],
)
async def test_internal_whitespace_and_case_differences_are_still_a_source_mismatch(service, repo, stored, csv_source):
    await repo.upsert_source(SITE, "/", "tstored", "en", stored)

    res = await _import(service, [{"route": "/", "key": "tstored", "source": csv_source, "text": "x"}])

    assert res["errors"][0]["reason"] == "source_mismatch"
    assert (await _doc(repo, "tstored"))["translations"] == {}
