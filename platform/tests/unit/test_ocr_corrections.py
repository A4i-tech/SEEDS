from __future__ import annotations

import asyncio

import pytest
from omni_ingest.core.model import ByteContent, KnowledgeItem

from app.remediation.apply_corrections import ApplyCorrectionsAgent
from app.repositories.ocr_correction_repository import OcrCorrectionRepository
from tests.support.mongomock_async import AsyncMongoMockClient

BOOK = {"grade": "7", "subject": "Science", "language": "Bengali"}


class _Ctx:
    def __init__(self, texts: list[str], book: dict | None = None, blocks: list[dict] | None = None) -> None:
        self.metadata = {"book": book or BOOK}
        self.items = [
            KnowledgeItem(content=ByteContent(), metadata={"kind": "page", "verified": {"markdown": t}})
            for t in texts
        ]
        if blocks is not None:
            self.items[0].metadata["remediation"] = {"blocks": blocks}


def _row(wrong: str, right: str, **kw) -> dict:
    return {
        "language": "bengali",
        "wrong": wrong,
        "right": right,
        "grade": None,
        "subject": None,
        "context": None,
        "page": None,
        "status": "pending",
        "source": "test",
        "added_by": "u1",
        **kw,
    }


async def _run(rows: list[dict], text: str, book: dict | None = None, blocks: list[dict] | None = None) -> KnowledgeItem:
    ctx = _Ctx([text], book, blocks)
    await ApplyCorrectionsAgent(corrections=rows).run(ctx)
    return ctx.items[0]


@pytest.fixture
async def repo():
    db = AsyncMongoMockClient()["test_seeds"]
    await OcrCorrectionRepository.ensure_indexes(db)
    return OcrCorrectionRepository(db)


async def test_listed_form_is_corrected():
    item = await _run([_row("কপাগুলো", "কণাগুলো")], "এই কপাগুলো ছোট")
    assert item.metadata["verified"]["markdown"] == "এই কণাগুলো ছোট"
    assert item.metadata["corrections_applied"] == [{"wrong": "কপাগুলো", "right": "কণাগুলো", "count": 1}]


async def test_whole_word_only():
    item = await _run([_row("কপা", "কণা")], "কপার সালফেট এবং কপাগুলো")
    assert item.metadata["verified"]["markdown"] == "কপার সালফেট এবং কপাগুলো"
    assert item.metadata["corrections_applied"] == []


async def test_vowel_sign_after_word_blocks_match():
    item = await _run([_row("কপ", "কণ")], "কপে")
    assert item.metadata["verified"]["markdown"] == "কপে"


async def test_danda_after_word_still_matches():
    item = await _run([_row("কপ", "কণ")], "এই কপ।")
    assert item.metadata["verified"]["markdown"] == "এই কণ।"


async def test_regex_chars_are_literal():
    item = await _run([_row("a.c", "x")], "abc a.c")
    assert item.metadata["verified"]["markdown"] == "abc x"


async def test_other_language_does_not_apply():
    item = await _run([_row("কপা", "কণা", language="hindi")], "কপা")
    assert item.metadata["verified"]["markdown"] == "কপা"


@pytest.mark.parametrize("book_language", ["বাংলা", "Bangla"])
async def test_language_alias_applies(book_language):
    item = await _run([_row("কপা", "কণা")], "কপা", book={**BOOK, "language": book_language})
    assert item.metadata["verified"]["markdown"] == "কণা"


async def test_context_mismatch_does_not_apply():
    rows = [_row("কপা", "কণা", context="পদার্থ")]
    assert (await _run(rows, "কপা ছোট")).metadata["verified"]["markdown"] == "কপা ছোট"
    assert (await _run(rows, "পদার্থ কপা")).metadata["verified"]["markdown"] == "পদার্থ কণা"


async def test_grade_mismatch_does_not_apply():
    item = await _run([_row("কপা", "কণা", grade="9")], "কপা")
    assert item.metadata["verified"]["markdown"] == "কপা"


async def test_grade_compared_by_digits():
    rows = [_row("কপা", "কণা", grade="9")]
    assert (await _run(rows, "কপা", book={**BOOK, "grade": "Class 9"})).metadata["verified"]["markdown"] == "কণা"
    assert (await _run(rows, "কপা", book={**BOOK, "grade": "Class 10"})).metadata["verified"]["markdown"] == "কপা"


async def test_row_output_is_not_refed():
    item = await _run([_row("aa", "bb"), _row("bb", "cc")], "aa bb")
    assert item.metadata["verified"]["markdown"] == "bb cc"


async def test_longest_wrong_wins_overlap():
    item = await _run([_row("ab", "X"), _row("ab cd", "Y")], "ab cd")
    assert item.metadata["verified"]["markdown"] == "Y"


async def test_block_text_and_list_items_are_corrected():
    blocks = [{"type": "paragraph", "text": "এই কপা"}, {"type": "list", "text": "", "items": ["কপা এক", "দুই"]}]
    item = await _run([_row("কপা", "কণা")], "কপা", blocks=blocks)
    assert item.metadata["remediation"]["blocks"][0]["text"] == "এই কণা"
    assert item.metadata["remediation"]["blocks"][1]["items"] == ["কণা এক", "দুই"]
    assert sum(c["count"] for c in item.metadata["corrections_applied"]) == 3


async def test_blocks_with_null_or_missing_items_do_not_crash():
    blocks = [{"type": "paragraph", "text": "এই কপা", "items": None}, {"type": "paragraph", "text": "কপা"}]
    item = await _run([_row("কপা", "কণা")], "কপা", blocks=blocks)
    assert [b["text"] for b in item.metadata["remediation"]["blocks"]] == ["এই কণা", "কণা"]


async def test_second_run_is_idempotent():
    rows = [_row("কপা", "কণা")]
    ctx = _Ctx(["কপা"], blocks=[{"type": "paragraph", "text": "কপা"}])
    agent = ApplyCorrectionsAgent(corrections=rows)
    await agent.run(ctx)
    first = ctx.items[0].metadata["corrections_applied"]
    await agent.run(ctx)
    assert ctx.items[0].metadata["remediation"]["blocks"][0]["text"] == "কণা"
    assert ctx.items[0].metadata["corrections_applied"] == first


async def test_item_without_remediation_does_not_crash():
    item = await _run([_row("কপা", "কণা")], "কপা")
    assert "remediation" not in item.metadata


async def test_duplicate_add_returns_existing_row_and_keeps_original_right(repo):
    first = await repo.add(_row("কপা", "কণা", grade="7"))
    second = await repo.add(_row("কপা", "অন্য", grade="7"))
    assert second["_id"] == first["_id"]
    assert second["right"] == "কণা"
    assert len(await repo.find_by_status(None)) == 1


async def test_simultaneous_duplicate_adds_keep_one_row(repo):
    first, second = await asyncio.gather(repo.add(_row("কপা", "কণা")), repo.add(_row("কপা", "কণা")))
    assert first["_id"] == second["_id"]
    assert len(await repo.find_by_status(None)) == 1


async def test_add_empty_wrong_raises(repo):
    with pytest.raises(ValueError, match="wrong"):
        await repo.add(_row("", "কণা"))


async def test_status_flow_and_lowercase(repo):
    row = await repo.add(_row("a", "b", language="Bengali"))
    assert row["language"] == "bengali"
    assert await repo.find_approved() == []
    await repo.set_status(row["_id"], "approved")
    assert [r["wrong"] for r in await repo.find_approved()] == ["a"]


async def test_find_by_id_returns_row_or_none(repo):
    row = await repo.add(_row("a", "b"))
    assert (await repo.find_by_id(row["_id"]))["wrong"] == "a"
    assert await repo.find_by_id("missing") is None


async def test_kind_defaults_to_ocr(repo):
    assert (await repo.add(_row("a", "b")))["kind"] == "ocr"


async def test_kind_is_part_of_dedup_key_and_find_approved_is_ocr_only(repo):
    ocr = await repo.add(_row("a", "b"))
    tr = await repo.add(_row("a", "b", kind="translation"))
    assert ocr["_id"] != tr["_id"]
    await repo.set_status(ocr["_id"], "approved")
    await repo.set_status(tr["_id"], "approved")
    assert [r["_id"] for r in await repo.find_approved()] == [ocr["_id"]]
