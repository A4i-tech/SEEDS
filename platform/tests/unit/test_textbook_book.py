from __future__ import annotations

import base64
import inspect
import io
import zipfile

import pytest
from bson import ObjectId

from app.controllers import textbook_book_controller as ctl
from app.models.textbook_book import CreateBookRequest
from app.platform.auth.dependencies import require_tenant
from app.platform.error_handling import AppError, ValidationError
from app.remediation.accuracy import score_edit
from app.repositories.textbook_book_repository import TextbookBookRepository
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository
from app.services import textbook_book
from app.services import textbook_remediation as remediation_service
from app.services.textbook_book import TextbookBookService
from app.services.textbook_remediation import fetch_images
from tests.support.mongomock_async import AsyncMongoMockClient
from tests.unit.test_textbook_remediation import _StubBlob, _StubUpload

USER = {"tenant_id": "tenant-a", "sub": "t1", "role": "tenant"}
VOLUNTEER = {"tenant_id": "tenant-a", "sub": "v1", "role": "textbook_remediation_volunteer"}
PDF = b"%PDF-1.7 body"
_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
def repo(db):
    return TextbookRemediationRepository(db)


@pytest.fixture
def books(db):
    return TextbookBookRepository(db)


def _svc(db, blob):
    return TextbookBookService(db, blob)


def _payload(title="Science", language="ta", target_language=""):
    return CreateBookRequest(title=title, language=language, target_language=target_language)


@pytest.fixture
def fake_compile(monkeypatch):
    """Replace pandoc and LibreOffice. The fake records each Markdown it gets and writes one file per format."""
    built: list[str] = []
    formats = {"pdf": False}

    def compile_fake(markdown, out_dir):
        built.append(markdown)
        docx, tex = out_dir / "r.docx", out_dir / "r.tex"
        docx.write_bytes(b"docx:" + markdown.encode())
        tex.write_bytes(b"tex")
        pdf = None
        if formats["pdf"]:
            pdf = out_dir / "r.pdf"
            pdf.write_bytes(b"%PDF-fake")
        return docx, tex, pdf

    monkeypatch.setattr(textbook_book, "compile_verified", compile_fake)
    compile_fake.built = built
    compile_fake.formats = formats
    return compile_fake


async def _make_book(db, blob, names=("unit_01.pdf", "unit_02.pdf", "unit_03.pdf")):
    return await _svc(db, blob).create_book(
        "tenant-a", _payload(), [_StubUpload(PDF, filename=n) for n in names],
    )


async def _verify(repo, job_id, md):
    await repo.update_draft(job_id, md, None)
    await repo.mark_verified(job_id, verified_by="r", accuracy=score_edit(md, md))


@pytest.mark.asyncio
async def test_create_book_keeps_the_upload_order_and_tags_each_chapter(db, repo, books):
    out = await _make_book(db, _StubBlob(), names=("unit_10.pdf", "unit_02.pdf"))
    jobs = [await repo.get("tenant-a", i) for i in out.job_ids]
    assert [j.source_name for j in jobs] == ["unit_10.pdf", "unit_02.pdf"]
    assert {j.book_id for j in jobs} == {out.book_id}
    assert {j.language for j in jobs} == {"ta"}
    assert (await books.get("tenant-a", out.book_id)).job_ids == out.job_ids


@pytest.mark.asyncio
async def test_one_pdf_is_refused_with_the_next_step(db, repo, books):
    with pytest.raises(ValidationError, match="needs 2 to 50 PDFs"):
        await _make_book(db, _StubBlob(), names=("only.pdf",))


@pytest.mark.asyncio
async def test_more_than_fifty_pdfs_are_refused(db, repo, books):
    with pytest.raises(ValidationError, match="got 51"):
        await _make_book(db, _StubBlob(), names=tuple(f"u{i}.pdf" for i in range(51)))


@pytest.mark.asyncio
async def test_over_limit_chapter_refuses_the_whole_book_and_saves_nothing(db, repo, books):
    big = _StubUpload(b"%PDF-1.7" + b"0" * (10 * 1024 * 1024), filename="big.pdf")
    with pytest.raises(ValidationError, match="big.pdf is 10.0 MB"):
        await _svc(db, _StubBlob()).create_book(
            "tenant-a", _payload(title="T"),
            [_StubUpload(PDF, filename="a.pdf"), big],
        )
    assert await books.list_books("tenant-a") == []
    assert await repo.list_jobs("tenant-a") == []


@pytest.mark.asyncio
async def test_blank_book_name_is_refused_with_the_next_step(db, repo, books):
    with pytest.raises(ValidationError, match="book name is empty"):
        await _svc(db, _StubBlob()).create_book(
            "tenant-a", CreateBookRequest(title="   ", language="ta", target_language=""),
            [_StubUpload(PDF, filename="a.pdf"), _StubUpload(PDF, filename="b.pdf")],
        )
    assert await repo.list_jobs("tenant-a") == []


@pytest.mark.asyncio
async def test_failed_chapter_upload_fails_loud_and_saves_no_book(db, repo, books):
    class FailsOnSecond(_StubBlob):
        async def upload_file(self, container, blob_name, data, content_type):
            if len(self.uploaded) == 1:
                raise RuntimeError("storage down")
            return await super().upload_file(container, blob_name, data, content_type)

    blob = FailsOnSecond()
    with pytest.raises(RuntimeError, match="storage down"):
        await _make_book(db, blob)
    assert await books.list_books("tenant-a") == []


@pytest.mark.asyncio
async def test_failed_book_insert_fails_loud(db, repo, books, monkeypatch):
    async def boom(*_, **__):
        raise RuntimeError("mongo down")

    monkeypatch.setattr("app.services.textbook_book.TextbookBookRepository.create", boom)
    blob = _StubBlob()
    with pytest.raises(RuntimeError, match="mongo down"):
        await _make_book(db, blob)


@pytest.mark.asyncio
async def test_reorder_needs_every_chapter_exactly_once(db, repo, books):
    out = await _make_book(db, _StubBlob())
    a, b, c = out.job_ids
    done = await _svc(db, _StubBlob()).reorder_book("tenant-a", out.book_id, [c, a, b])
    assert done.job_ids == [c, a, b]
    assert done.edit_accuracy == 0.0
    for bad in ([a, b], [a, a, b, c], [a, b, "x"]):
        with pytest.raises(ValidationError, match="every chapter of the book exactly once"):
            await _svc(db, _StubBlob()).reorder_book("tenant-a", out.book_id, bad)


@pytest.mark.asyncio
async def test_download_waits_for_every_chapter_to_be_verified(db, repo, books):
    blob = _StubBlob()
    out = await _make_book(db, blob)
    await _verify(repo, out.job_ids[0], "# One")
    with pytest.raises(AppError) as exc:
        await _svc(db, blob).book_artifact("tenant-a", out.book_id, "pdf")
    assert exc.value.status_code == 409
    assert "2 chapter(s) are not verified yet: unit_02.pdf, unit_03.pdf" in exc.value.message


@pytest.mark.asyncio
async def test_book_is_one_document_in_saved_order_built_once_and_rebuilt_after_a_change(db, repo, books, fake_compile):
    blob = _StubBlob()
    out = await _make_book(db, blob)
    a, b, c = out.job_ids
    for job_id, md in zip(out.job_ids, ("# One", "# Two", "# Three"), strict=True):
        await _verify(repo, job_id, md)
    await _svc(db, blob).reorder_book("tenant-a", out.book_id, [c, a, b])

    async def download(fmt):
        book = await books.get("tenant-a", out.book_id)
        return await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, fmt)

    data, kind = await download("docx")
    assert data == b"docx:# Three\n\n# One\n\n# Two"
    assert "wordprocessingml" in kind
    await download("tex")
    assert len(fake_compile.built) == 1  # the second format reads the stored build

    await _verify(repo, a, "# One edited")
    data, _ = await download("docx")
    assert len(fake_compile.built) == 2
    assert data.endswith(b"# One edited\n\n# Two")

    with pytest.raises(ValueError, match="md"):
        await download("md")


@pytest.mark.asyncio
async def test_pdf_is_stored_and_served_as_pdf_and_a_missing_pdf_is_built_again_then_explained(db, repo, books, fake_compile):
    blob = _StubBlob()
    out = await _make_book(db, blob, names=("a.pdf", "b.pdf"))
    for job_id in out.job_ids:
        await _verify(repo, job_id, "# x")

    async def download(fmt):
        book = await books.get("tenant-a", out.book_id)
        return await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, fmt)

    with pytest.raises(AppError, match="PDF of this book could not be built") as exc:
        await download("pdf")
    assert exc.value.status_code == 404
    fake_compile.formats["pdf"] = True  # LibreOffice is back
    data, kind = await download("pdf")
    assert (data, kind) == (b"%PDF-fake", "application/pdf")
    assert len(fake_compile.built) == 2


@pytest.mark.asyncio
async def test_a_chapter_cleared_to_empty_text_stays_empty_in_the_book(db, repo, books, fake_compile):
    blob = _StubBlob()
    out = await _make_book(db, blob, names=("a.pdf", "b.pdf"))
    first, second = out.job_ids
    await repo.record_artifacts(first, {"remediated": "https://blob/a.md"}, {})
    blob = _StubBlob({"https://blob/a.md": b"machine text"})
    await _verify(repo, first, "")
    await _verify(repo, second, "# Two")
    book = await books.get("tenant-a", out.book_id)
    await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "docx")
    assert "machine text" not in fake_compile.built[0]


@pytest.mark.asyncio
async def test_deleting_a_chapter_keeps_the_book_and_skips_it(db, repo, books, fake_compile):
    blob = _StubBlob()
    out = await _make_book(db, blob)
    a, b, c = out.job_ids
    for job_id in out.job_ids:
        await _verify(repo, job_id, f"# {job_id[-3:]}")
    await repo.soft_delete("tenant-a", b)
    book = await books.get("tenant-a", out.book_id)
    await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "docx")
    assert fake_compile.built == [f"# {a[-3:]}\n\n# {c[-3:]}"]


@pytest.mark.asyncio
async def test_book_with_every_chapter_deleted_says_so(db, repo, books):
    blob = _StubBlob()
    out = await _make_book(db, blob)
    for job_id in out.job_ids:
        await repo.soft_delete("tenant-a", job_id)
    book = await books.get("tenant-a", out.book_id)
    with pytest.raises(AppError, match="no chapters left"):
        await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "docx")


@pytest.mark.asyncio
async def test_delete_book_removes_the_book_and_its_chapters(db, repo, books):
    out = await _make_book(db, _StubBlob())
    await _svc(db, _StubBlob()).delete_book("tenant-a", out.book_id)
    assert await books.get("tenant-a", out.book_id) is None
    assert await repo.list_jobs("tenant-a") == []


@pytest.mark.asyncio
async def test_job_list_carries_books_with_only_live_chapters_newest_first(db, repo, books):
    out = await _make_book(db, _StubBlob())
    for n, job_id in enumerate(out.job_ids):  # the clock can tie on Windows, so set the order
        await db[TextbookRemediationRepository.COLLECTION_NAME].update_one(
            {"_id": ObjectId(job_id)}, {"$set": {"created_at": f"2026-01-01T00:00:0{n}+00:00"}}
        )
    await repo.soft_delete("tenant-a", out.job_ids[1])
    svc = _svc(db, _StubBlob())
    body = await svc.list_jobs_with_books("tenant-a", volunteer=False, assigned_to="", limit=1)
    assert [j.job_id for j in body.jobs] == [out.job_ids[2], out.job_ids[0]]
    assert {j.book_id for j in body.jobs} == {out.book_id}
    [book] = body.books
    assert book.job_ids == [out.job_ids[0], out.job_ids[2]]


@pytest.mark.asyncio
async def test_list_skips_a_malformed_chapter_instead_of_failing_the_whole_list(db, repo, books):
    out = await _make_book(db, _StubBlob(), names=("a.pdf", "b.pdf"))
    await db[TextbookRemediationRepository.COLLECTION_NAME].update_one(
        {"_id": ObjectId(out.job_ids[0])}, {"$set": {"status": "not-a-status"}}
    )
    svc = _svc(db, _StubBlob())
    body = await svc.list_jobs_with_books("tenant-a", volunteer=False, assigned_to="", limit=20)
    assert [j.job_id for j in body.jobs] == [out.job_ids[1]]


@pytest.mark.asyncio
async def test_fetch_images_downloads_each_figure_into_a_folder_per_job_and_rewrites_the_links(repo, tmp_path):
    job = await repo.create(job_id=ObjectId(), tenant_id="tenant-a", source_name="a.pdf", source_url="u", language="ta")
    blob = _StubBlob({f"textbook-remediation/{job.job_id}/images/a_1_img.jpg": b"jpg"})
    md = '![One](images/a_1_img.jpg "title")\n\n![Gone](images/missing.jpg)'
    out = await fetch_images(job, md, tmp_path, blob)
    assert out == f'![One](images/{job.job_id}/a_1_img.jpg "title")\n\n![Gone](images/{job.job_id}/missing.jpg)'
    assert (tmp_path / "images" / job.job_id / "a_1_img.jpg").read_bytes() == b"jpg"
    assert not (tmp_path / "images" / job.job_id / "missing.jpg").exists()


@pytest.mark.asyncio
async def test_fetch_images_keeps_a_climbing_link_inside_the_job_folder(repo, tmp_path):
    job = await repo.create(job_id=ObjectId(), tenant_id="tenant-a", source_name="a.pdf", source_url="u", language="ta")
    out = await fetch_images(job, "![x](images/../../secret.png)", tmp_path, _StubBlob())
    assert out == f"![x](images/{job.job_id}/secret.png)"


@pytest.mark.asyncio
async def test_book_word_file_holds_the_figures_of_every_chapter(db, repo, books):
    out = await _make_book(db, _StubBlob(), names=("unit_01.pdf", "unit_02.pdf"))
    blob = _StubBlob({
        f"textbook-remediation/{jid}/images/fig_{n}.png": _PNG for n, jid in enumerate(out.job_ids)
    })
    for n, job_id in enumerate(out.job_ids):
        await _verify(repo, job_id, f"# Chapter {n}\n\n![Figure {n}](images/fig_{n}.png)")
    book = await books.get("tenant-a", out.book_id)
    data, _ = await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "docx")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert len([n for n in z.namelist() if n.startswith("word/media/")]) == 2


def test_book_routes_are_tenant_only():
    for route in (ctl.create_book, ctl.reorder_book, ctl.delete_book, ctl.get_book_artifact):
        assert inspect.signature(route).parameters["user"].default.dependency is require_tenant


@pytest.mark.asyncio
async def test_volunteer_sees_a_book_only_through_their_assigned_chapters(db, repo, books):
    out = await _make_book(db, _StubBlob())
    first = out.job_ids[0]
    await repo.set_assignment("tenant-a", first, "v1")

    svc = _svc(db, _StubBlob())
    body = await svc.list_jobs_with_books("tenant-a", volunteer=True, assigned_to="v1", limit=20)
    assert [j.job_id for j in body.jobs] == [first]
    assert [(b.job_ids, b.edit_accuracy) for b in body.books] == [([first], 0.0)]

    body = await svc.list_jobs_with_books("tenant-a", volunteer=True, assigned_to="v2", limit=20)
    assert body.jobs == [] and body.books == []

    tenant = await svc.list_jobs_with_books("tenant-a", volunteer=False, assigned_to="", limit=1)
    assert len(tenant.books) == 1 and len(tenant.jobs) == 3


@pytest.mark.asyncio
async def test_verify_stores_the_accuracy_and_a_book_adds_it_up_by_length(db, repo, books, monkeypatch):
    monkeypatch.setattr(remediation_service, "compile_verified", lambda markdown, out_dir: (None, None, None))
    out = await _make_book(db, _StubBlob(), names=("a.pdf", "b.pdf"))
    first, second = out.job_ids
    original = {first: "abcdefghij", second: "abcdefghijklmnopqrst"}
    edited = {first: "abcdefghij", second: "abcdefghijklmnopqrXX"}
    blob = _StubBlob({f"https://blob/{j}.md": original[j].encode() for j in original})
    for job_id in out.job_ids:
        await repo.record_artifacts(job_id, {"remediated": f"https://blob/{job_id}.md"}, {})
        job = await repo.update_draft(job_id, edited[job_id], None)
        await remediation_service.verify_job(repo, blob, job, title="T", verified_by="r", edited_by="r")

    a, b = [await repo.get("tenant-a", j) for j in out.job_ids]
    assert (a.edit_accuracy, b.edit_accuracy) == (100.0, 90.0)
    assert (b.edit_chars_changed, b.edit_chars_total) == (2, 20)
    (record,) = await repo.list_edits(second)
    assert record["accuracy"]["percent"] == 90.0
    assert textbook_book.book_accuracy([a, b]) == 93.3  # 2 changed of 30 characters, not (100 + 90) / 2


@pytest.mark.asyncio
async def test_book_accuracy_is_zero_until_a_chapter_is_verified_and_a_job_without_edits_is_100(db, repo, books):
    out = await _make_book(db, _StubBlob())
    jobs = [await repo.get("tenant-a", j) for j in out.job_ids]
    assert textbook_book.book_accuracy(jobs) == 0.0
    await repo.mark_verified(out.job_ids[0], verified_by="r", accuracy=score_edit("same text", "same text"))
    body = await _svc(db, _StubBlob()).list_jobs_with_books("tenant-a", volunteer=False, assigned_to="", limit=20)
    assert body.books[0].edit_accuracy == 100.0
    scores = {j.job_id: j.edit_accuracy for j in body.jobs}
    assert (scores[out.job_ids[0]], scores[out.job_ids[1]]) == (100.0, 0.0)


@pytest.mark.asyncio
async def test_clearing_the_whole_chapter_scores_0_and_no_baseline_means_no_score(repo, monkeypatch):
    monkeypatch.setattr(remediation_service, "compile_verified", lambda markdown, out_dir: (None, None, None))
    cleared = await repo.create(job_id=ObjectId(), tenant_id="tenant-a", source_name="a.pdf", source_url="u", language="ta")
    await repo.record_artifacts(cleared.job_id, {"remediated": "https://blob/a.md"}, {})
    job = await repo.update_draft(cleared.job_id, "")
    blob = _StubBlob({"https://blob/a.md": b"machine text"})
    done = await remediation_service.verify_job(repo, blob, job, title="T", verified_by="r", edited_by="r")
    assert done.edit_accuracy == 0.0
    assert len(await repo.list_edits(cleared.job_id)) == 1

    bare = await repo.create(job_id=ObjectId(), tenant_id="tenant-a", source_name="b.pdf", source_url="u", language="ta")
    job = await repo.update_draft(bare.job_id, "reviewed text")
    done = await remediation_service.verify_job(repo, blob, job, title="T", verified_by="r", edited_by="r")
    assert done.edit_accuracy == 0.0


@pytest.mark.asyncio
async def test_a_failed_build_leaves_no_edit_record_so_a_retry_adds_one(repo, monkeypatch):
    job = await repo.create(job_id=ObjectId(), tenant_id="tenant-a", source_name="a.pdf", source_url="u", language="ta")
    await repo.record_artifacts(job.job_id, {"remediated": "https://blob/a.md"}, {})
    job = await repo.update_draft(job.job_id, "reviewed")
    blob = _StubBlob({"https://blob/a.md": b"machine"})

    def broken(markdown, out_dir):
        raise RuntimeError("pandoc crashed")

    monkeypatch.setattr(remediation_service, "compile_verified", broken)
    with pytest.raises(ValidationError):
        await remediation_service.verify_job(repo, blob, job, title="T", verified_by="r", edited_by="r")
    assert await repo.list_edits(job.job_id) == []

    monkeypatch.setattr(remediation_service, "compile_verified", lambda markdown, out_dir: (None, None, None))
    await remediation_service.verify_job(repo, blob, job, title="T", verified_by="r", edited_by="r")
    assert len(await repo.list_edits(job.job_id)) == 1


@pytest.mark.asyncio
async def test_reopening_a_verified_job_clears_its_score(repo):
    job = await repo.create(job_id=ObjectId(), tenant_id="tenant-a", source_name="a.pdf", source_url="u", language="ta")
    await repo.mark_verified(job.job_id, verified_by="r", accuracy=score_edit("abc", "abd"))
    assert (await repo.get("tenant-a", job.job_id)).edit_accuracy == 66.7
    reopened = await repo.update_draft(job.job_id, "abd more")
    assert (reopened.edit_accuracy, reopened.edit_chars_total) == (0.0, 0)


@pytest.mark.asyncio
async def test_book_score_counts_an_unscored_chapter_as_zero_and_volunteers_see_zero(db, repo, books):
    out = await _make_book(db, _StubBlob(), names=("a.pdf", "b.pdf"))
    first, second = out.job_ids
    await repo.mark_verified(first, verified_by="r", accuracy=score_edit("abcd", "abcd"))
    await repo.mark_verified(second, verified_by="r", accuracy=score_edit("", ""))
    jobs = [await repo.get("tenant-a", j) for j in out.job_ids]
    assert textbook_book.book_accuracy(jobs) == 100.0
    await repo.mark_verified(second, verified_by="r", accuracy=score_edit("abcd", "abcd"))
    await repo.set_assignment("tenant-a", first, "v1")
    svc = _svc(db, _StubBlob())
    assert (await svc.list_jobs_with_books("tenant-a", volunteer=False, assigned_to="", limit=20)).books[0].edit_accuracy == 100.0
    assert (await svc.list_jobs_with_books("tenant-a", volunteer=True, assigned_to="v1", limit=20)).books[0].edit_accuracy == 0.0
