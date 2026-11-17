from __future__ import annotations

import base64
import io
import zipfile

import pytest
from bson import ObjectId

from app.controllers import textbook_book_controller as ctl
from app.controllers.textbook_remediation_controller import list_remediation_jobs
from app.platform.error_handling import AppError, NotFoundError, ValidationError
from app.repositories.textbook_book_repository import TextbookBookRepository
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository
from app.services import textbook_book
from tests.support.mongomock_async import AsyncMongoMockClient
from tests.unit.test_textbook_remediation import _StubBlob, _StubUpload

USER = {"tenant_id": "tenant-a"}
PDF = b"%PDF-1.7 body"


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
def repo(db):
    return TextbookRemediationRepository(db)


@pytest.fixture
def books(db):
    return TextbookBookRepository(db)


async def _make_book(repo, books, blob, names=("unit_01.pdf", "unit_02.pdf", "unit_03.pdf")):
    out = await ctl.create_book(
        files=[_StubUpload(PDF, filename=n) for n in names], title="Science", language="ta", target_language="",
        user=USER, repo=repo, books=books, blob_provider=blob,
    )
    return out


async def _verify(repo, job_id, md):
    await repo.update_draft(job_id, md, None)
    await repo.mark_verified(job_id, verified_by="r")


@pytest.mark.asyncio
async def test_create_book_keeps_the_upload_order_and_tags_each_chapter(repo, books):
    out = await _make_book(repo, books, _StubBlob(), names=("unit_10.pdf", "unit_02.pdf"))
    jobs = [await repo.get("tenant-a", i) for i in out["job_ids"]]
    assert [j.source_name for j in jobs] == ["unit_10.pdf", "unit_02.pdf"]
    assert {j.book_id for j in jobs} == {out["book_id"]}
    assert {j.language for j in jobs} == {"ta"}
    assert (await books.get("tenant-a", out["book_id"]))["job_ids"] == out["job_ids"]


@pytest.mark.asyncio
async def test_one_pdf_or_too_many_is_refused_with_the_next_step(repo, books):
    with pytest.raises(ValidationError, match="needs 2 to 50 PDFs"):
        await _make_book(repo, books, _StubBlob(), names=("only.pdf",))


@pytest.mark.asyncio
async def test_over_limit_chapter_refuses_the_whole_book_and_saves_nothing(repo, books):
    big = _StubUpload(b"%PDF-1.7" + b"0" * (10 * 1024 * 1024), filename="big.pdf")
    with pytest.raises(ValidationError, match="big.pdf is 10.0 MB"):
        await ctl.create_book(
            files=[_StubUpload(PDF, filename="a.pdf"), big], title="T", language="ta", target_language="",
            user=USER, repo=repo, books=books, blob_provider=_StubBlob(),
        )
    assert await books.list_books("tenant-a") == []
    assert await repo.list_jobs("tenant-a") == []


@pytest.mark.asyncio
async def test_reorder_needs_every_chapter_exactly_once(repo, books):
    out = await _make_book(repo, books, _StubBlob())
    a, b, c = out["job_ids"]
    done = await ctl.reorder_book(out["book_id"], ctl.ReorderBookRequest(job_ids=[c, a, b]), USER, repo, books)
    assert done["job_ids"] == [c, a, b]
    for bad in ([a, b], [a, a, b, c], [a, b, "x"]):
        with pytest.raises(ValidationError, match="every chapter of the book exactly once"):
            await ctl.reorder_book(out["book_id"], ctl.ReorderBookRequest(job_ids=bad), USER, repo, books)


@pytest.mark.asyncio
async def test_download_waits_for_every_chapter_to_be_verified(repo, books):
    blob = _StubBlob()
    out = await _make_book(repo, books, blob)
    await _verify(repo, out["job_ids"][0], "# One")
    with pytest.raises(AppError) as exc:
        await ctl.get_book_artifact(out["book_id"], "pdf", USER, repo, books, blob)
    assert exc.value.status_code == 409
    assert "2 chapter(s) are not verified yet: unit_02.pdf, unit_03.pdf" in exc.value.message


@pytest.mark.asyncio
async def test_book_is_one_document_in_saved_order_built_once_and_rebuilt_after_a_change(repo, books, tmp_path, monkeypatch):
    blob = _StubBlob()
    out = await _make_book(repo, books, blob)
    a, b, c = out["job_ids"]
    for job_id, md in zip(out["job_ids"], ("# One", "# Two", "# Three"), strict=True):
        await _verify(repo, job_id, md)
    await ctl.reorder_book(out["book_id"], ctl.ReorderBookRequest(job_ids=[c, a, b]), USER, repo, books)
    built: list[str] = []

    async def fake_compile(markdown, out_dir):
        built.append(markdown)
        docx, tex = out_dir / "r.docx", out_dir / "r.tex"
        docx.write_bytes(b"docx:" + markdown.encode())
        tex.write_bytes(b"tex")
        return docx, tex, None

    book = await books.get("tenant-a", out["book_id"])
    data, kind = await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "docx", fake_compile)
    assert data == b"docx:# Three\n\n# One\n\n# Two"
    assert "wordprocessingml" in kind

    book = await books.get("tenant-a", out["book_id"])
    await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "tex", fake_compile)
    assert len(built) == 1  # second format reads the stored build

    await _verify(repo, a, "# One edited")
    book = await books.get("tenant-a", out["book_id"])
    data, _ = await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "docx", fake_compile)
    assert len(built) == 2
    assert data.endswith(b"# One edited\n\n# Two")

    with pytest.raises(NotFoundError, match="Book file"):  # no LibreOffice, so no pdf
        await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "pdf", fake_compile)
    with pytest.raises(ValidationError, match="Use docx, tex or pdf"):
        await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "md", fake_compile)


@pytest.mark.asyncio
async def test_deleting_a_chapter_keeps_the_book_and_skips_it(repo, books):
    blob = _StubBlob()
    out = await _make_book(repo, books, blob)
    a, b, c = out["job_ids"]
    for job_id in out["job_ids"]:
        await _verify(repo, job_id, f"# {job_id[-3:]}")
    await repo.soft_delete("tenant-a", b)
    seen: list[str] = []

    async def fake_compile(markdown, out_dir):
        seen.append(markdown)
        docx, tex = out_dir / "r.docx", out_dir / "r.tex"
        docx.write_bytes(b"d")
        tex.write_bytes(b"t")
        return docx, tex, None

    book = await books.get("tenant-a", out["book_id"])
    await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "docx", fake_compile)
    assert seen == [f"# {a[-3:]}\n\n# {c[-3:]}"]


@pytest.mark.asyncio
async def test_delete_book_removes_the_book_and_its_chapters(repo, books):
    out = await _make_book(repo, books, _StubBlob())
    await ctl.delete_book(out["book_id"], USER, repo, books)
    assert await books.get("tenant-a", out["book_id"]) is None
    assert await repo.list_jobs("tenant-a") == []


@pytest.mark.asyncio
async def test_job_list_carries_books_with_only_live_chapters(repo, books):
    out = await _make_book(repo, books, _StubBlob())
    await repo.soft_delete("tenant-a", out["job_ids"][1])
    body = await list_remediation_jobs(limit=1, user=USER, repo=repo, book_repo=books)
    assert sorted(j["job_id"] for j in body["jobs"]) == sorted([out["job_ids"][0], out["job_ids"][2]])
    assert {j["book_id"] for j in body["jobs"]} == {out["book_id"]}
    [book] = body["books"]
    assert book["job_ids"] == [out["job_ids"][0], out["job_ids"][2]]


_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


@pytest.mark.asyncio
async def test_fetch_images_downloads_each_figure_into_a_folder_per_job_and_rewrites_the_links(repo, tmp_path):
    from app.services.textbook_remediation import fetch_images

    job = await repo.create(job_id=ObjectId(), tenant_id="tenant-a", source_name="a.pdf", source_url="u", language="ta")
    blob = _StubBlob({f"textbook-remediation/{job.job_id}/images/a_1_img.jpg": b"jpg"})
    md = '![One](images/a_1_img.jpg "title")\n\n![Gone](images/missing.jpg)'
    out = await fetch_images(job, md, tmp_path, blob)
    assert out == f'![One](images/{job.job_id}/a_1_img.jpg "title")\n\n![Gone](images/{job.job_id}/missing.jpg)'
    assert (tmp_path / "images" / job.job_id / "a_1_img.jpg").read_bytes() == b"jpg"
    assert not (tmp_path / "images" / job.job_id / "missing.jpg").exists()


@pytest.mark.asyncio
async def test_book_word_file_holds_the_figures_of_every_chapter(repo, books):
    out = await _make_book(repo, books, _StubBlob(), names=("unit_01.pdf", "unit_02.pdf"))
    blob = _StubBlob({
        f"textbook-remediation/{jid}/images/fig_{n}.png": _PNG for n, jid in enumerate(out["job_ids"])
    })
    for n, job_id in enumerate(out["job_ids"]):
        await _verify(repo, job_id, f"# Chapter {n}\n\n![Figure {n}](images/fig_{n}.png)")
    book = await books.get("tenant-a", out["book_id"])
    data, _ = await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "docx")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert len([n for n in z.namelist() if n.startswith("word/media/")]) == 2


@pytest.mark.asyncio
async def test_blank_book_name_is_refused_with_the_next_step(repo, books):
    with pytest.raises(ValidationError, match="book name is empty"):
        await ctl.create_book(
            files=[_StubUpload(PDF, filename="a.pdf"), _StubUpload(PDF, filename="b.pdf")], title="   ", language="ta",
            target_language="", user=USER, repo=repo, books=books, blob_provider=_StubBlob(),
        )
    assert await repo.list_jobs("tenant-a") == []


@pytest.mark.asyncio
async def test_failed_chapter_upload_removes_the_chapters_saved_before_it(repo, books):
    class FailsOnSecond(_StubBlob):
        async def upload_file(self, container, blob_name, data, content_type):
            if len(self.uploaded) == 1:
                raise RuntimeError("storage down")
            return await super().upload_file(container, blob_name, data, content_type)

    with pytest.raises(RuntimeError, match="storage down"):
        await _make_book(repo, books, FailsOnSecond())
    assert await repo.list_jobs("tenant-a") == []
    assert await books.list_books("tenant-a") == []


@pytest.mark.asyncio
async def test_book_with_every_chapter_deleted_says_so(repo, books):
    blob = _StubBlob()
    out = await _make_book(repo, books, blob)
    for job_id in out["job_ids"]:
        await repo.soft_delete("tenant-a", job_id)
    book = await books.get("tenant-a", out["book_id"])
    with pytest.raises(AppError, match="no chapters left"):
        await textbook_book.book_artifact(repo, books, blob, "tenant-a", book, "docx")


@pytest.mark.asyncio
async def test_fetch_images_keeps_a_climbing_link_inside_the_job_folder(repo, tmp_path):
    from app.services.textbook_remediation import fetch_images

    job = await repo.create(job_id=ObjectId(), tenant_id="tenant-a", source_name="a.pdf", source_url="u", language="ta")
    out = await fetch_images(job, "![x](images/../../secret.png)", tmp_path, _StubBlob())
    assert out == f"![x](images/{job.job_id}/secret.png)"
