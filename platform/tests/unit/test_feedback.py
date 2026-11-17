from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.controllers import ocr_feedback_controller as ctl
from app.platform.error_handling import AppError
from app.repositories.glossary_repository import GlossaryRepository
from app.repositories.ocr_correction_repository import OcrCorrectionRepository
from tests.support.mongomock_async import AsyncMongoMockClient

USER = {"sub": "u1"}


async def _add(db, **kw):
    base = {
        "kind": "ocr", "language": "Bengali", "wrong": "কপা", "right": "কণা", "grade": None, "subject": None,
        "context": None, "page": None, "status": "pending", "source": "edit_diff:j1", "added_by": "u1",
    }
    row = await OcrCorrectionRepository(db).add({**base, **kw})
    return SimpleNamespace(id=row["_id"])


@pytest.fixture
async def db():
    database = AsyncMongoMockClient()["test_seeds"]
    await OcrCorrectionRepository.ensure_indexes(database)
    return database


async def test_approve_translation_adds_one_glossary_row(db):
    out = await _add(db, kind="translation")
    await ctl.approve_correction(out.id, db, USER)
    [term] = await GlossaryRepository(db).find_all()
    assert (term["source_term"], term["target_lang"], term["translated_term"]) == ("কপা", "bn", "কণা")
    assert [r["_id"] for r in await OcrCorrectionRepository(db).find_by_status("approved")] == [out.id]
    assert await OcrCorrectionRepository(db).find_approved() == []


async def test_approve_twice_is_409_and_keeps_one_glossary_row(db):
    out = await _add(db, kind="translation")
    await ctl.approve_correction(out.id, db, USER)
    with pytest.raises(AppError) as exc:
        await ctl.approve_correction(out.id, db, USER)
    assert exc.value.status_code == 409
    assert "approved" in exc.value.message
    assert len(await GlossaryRepository(db).find_all()) == 1


async def test_approve_leaves_row_pending_when_glossary_write_fails(db):
    out = await _add(db, kind="translation")
    with patch.object(GlossaryRepository, "add_term", AsyncMock(side_effect=RuntimeError("db down"))), pytest.raises(RuntimeError):
        await ctl.approve_correction(out.id, db, USER)
    [row] = await OcrCorrectionRepository(db).find_by_status(None)
    assert row["status"] == "pending"


async def test_approve_translation_with_unknown_language_is_422(db):
    out = await _add(db, kind="translation", language="Klingon")
    with pytest.raises(AppError) as exc:
        await ctl.approve_correction(out.id, db, USER)
    assert exc.value.status_code == 422
    assert "klingon" in exc.value.message
    assert await GlossaryRepository(db).find_all() == []


async def test_approve_ocr_leaves_glossary_alone(db):
    out = await _add(db)
    await ctl.approve_correction(out.id, db, USER)
    assert await GlossaryRepository(db).find_all() == []
    assert len(await OcrCorrectionRepository(db).find_approved()) == 1


async def test_reject_sets_status_and_unknown_id_is_404(db):
    out = await _add(db)
    await ctl.reject_correction(out.id, db, USER)
    assert [r["status"] for r in await OcrCorrectionRepository(db).find_by_status(None)] == ["rejected"]
    with pytest.raises(AppError) as exc:
        await ctl.reject_correction("missing", db, USER)
    assert exc.value.status_code == 404


async def test_list_filters_by_status(db):
    out = await _add(db)
    await _add(db, wrong="other")
    await ctl.approve_correction(out.id, db, USER)
    assert len(await ctl.list_corrections("pending", db, USER)) == 1
    assert len(await ctl.list_corrections(None, db, USER)) == 2
