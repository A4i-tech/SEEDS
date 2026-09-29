from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from azure.core.exceptions import ResourceNotFoundError
from bson import ObjectId

from app.consumers.textbook_remediation_consumer import _resolve_models
from app.controllers.textbook_remediation_controller import (
    DraftUpdateRequest,
    VerifyJobRequest,
    create_remediation_job,
    get_remediation_artifact,
    get_remediation_image,
    get_remediation_page,
    get_review_summary,
    require_remediation_access,
    save_remediation_draft,
    verify_remediation_job,
)
from app.models.remediation_job import STAGES, JobStage, JobStatus, RemediationJob
from app.platform.error_handling import ForbiddenError, NotFoundError, ValidationError
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository
from app.services.textbook_remediation import artifact_bytes as _artifact_bytes
from app.services.textbook_remediation import serialize_job, subscribe
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    return TextbookRemediationRepository(AsyncMongoMockClient()["test_seeds"])


async def _create(repo, tenant_id="tenant-a"):
    return await repo.create(
        job_id=ObjectId(), tenant_id=tenant_id, source_name="book.pdf",
        source_url="https://blob/source.pdf", language="kn",
    )


@pytest.mark.asyncio
async def test_create_starts_pending_with_no_stage(repo):
    job = await _create(repo)
    assert (job.status, job.stage, job.artifacts, job.counts) == ("pending", None, {}, {})
    assert (await repo.get("tenant-a", job.job_id)).source_name == "book.pdf"


@pytest.mark.asyncio
async def test_get_is_tenant_scoped(repo):
    job = await _create(repo)
    assert await repo.get("tenant-b", job.job_id) is None


@pytest.mark.asyncio
async def test_get_hides_a_soft_deleted_job(repo):
    job = await _create(repo)
    await repo.soft_delete("tenant-a", job.job_id)
    assert await repo.get("tenant-a", job.job_id) is None


@pytest.mark.asyncio
async def test_claim_skips_a_soft_deleted_pending_job(repo):
    job = await _create(repo)
    await repo.soft_delete("tenant-a", job.job_id)
    assert await repo.claim_next_pending() is None


@pytest.mark.asyncio
async def test_claim_moves_one_job_to_running_at_ocr(repo):
    job = await _create(repo)
    claimed = await repo.claim_next_pending()
    assert (claimed.job_id, claimed.status, claimed.stage) == (job.job_id, "running", "ocr")
    assert await repo.claim_next_pending() is None


@pytest.mark.asyncio
async def test_record_artifacts_merges_rather_than_replaces(repo):
    job = await _create(repo)
    await repo.record_artifacts(job.job_id, {"raw": "https://blob/raw.md"}, {"raw_chars": 10})
    job = await repo.record_artifacts(job.job_id, {"docx": "https://blob/d.docx"}, {"findings": 3})
    assert job.artifacts == {"raw": "https://blob/raw.md", "docx": "https://blob/d.docx"}
    assert job.counts == {"raw_chars": 10, "findings": 3}


@pytest.mark.asyncio
async def test_finish_records_status_and_error(repo):
    job = await _create(repo)
    job = await repo.finish(job.job_id, JobStatus.FAILED, error="ocr failed")
    assert (job.status, job.error) == ("failed", "ocr failed")
    assert job.finished_at is not None


@pytest.mark.asyncio
async def test_reconcile_fails_jobs_stranded_by_a_restart(repo):
    job = await _create(repo)
    await repo.claim_next_pending()
    assert await repo.reconcile_interrupted_jobs() == 1
    assert (await repo.get("tenant-a", job.job_id)).status == "failed"


def test_serialize_job_numbers_the_stage_for_a_progress_bar():
    job = RemediationJob(
        job_id="j", tenant_id="t", source_name="book.pdf", source_url="u", language="kn",
        status="running", stage="review",
    )
    payload = serialize_job(job)
    assert (payload["stage_index"], payload["stage_count"]) == (2, len(STAGES))


def test_serialize_job_reports_stage_zero_before_the_first_stage():
    job = RemediationJob(
        job_id="j", tenant_id="t", source_name="book.pdf", source_url="u", language="kn",
        status="pending", stage=None,
    )
    assert serialize_job(job)["stage_index"] == 0


@pytest.mark.asyncio
async def test_subscribe_ends_on_a_finished_job(repo):
    job = await _create(repo)
    await repo.finish(job.job_id, JobStatus.READY_TO_REVIEW)
    events = [e async for e in subscribe(repo, "tenant-a", job.job_id, interval=0)]
    assert [e["event"] for e in events] == ["done"]


@pytest.mark.asyncio
async def test_subscribe_yields_each_change_then_done(repo):
    job = await _create(repo)
    await repo.claim_next_pending()

    events = []
    async for event in subscribe(repo, "tenant-a", job.job_id, interval=0):
        events.append(event)
        if len(events) == 1:
            await repo.set_stage(job.job_id, JobStage.REVIEW)
        elif len(events) == 2:
            await repo.finish(job.job_id, JobStatus.READY_TO_REVIEW)
    assert [e["event"] for e in events] == ["progress", "progress", "done"]
    assert [e["job"]["stage"] for e in events] == ["ocr", "review", "review"]


@pytest.mark.asyncio
async def test_subscribe_stops_on_an_unknown_job(repo):
    assert [e async for e in subscribe(repo, "tenant-a", "000000000000000000000000", interval=0)] == []



class _StubUpload:
    def __init__(self, data: bytes, content_type: str = "application/pdf", filename: str = "book.pdf"):
        import io

        self.file = io.BytesIO(data)
        self.content_type, self.filename = content_type, filename

    async def read(self, size: int = -1) -> bytes:
        return self.file.read(size)

    async def seek(self, offset: int) -> None:
        self.file.seek(offset)


async def _chunked(data: bytes, size: int = 8):
    for i in range(0, len(data), size):
        yield data[i:i + size]


class _StubBlob:
    def __init__(self, downloads: dict[str, bytes] | None = None):
        self.uploaded: dict[str, bytes] = {}
        self._downloads = downloads or {}

    async def upload_file(self, container, blob_name, data, content_type):
        self.uploaded[blob_name] = data.read() if hasattr(data, "read") else data
        return f"https://blob/{blob_name}"

    async def download_from_url(self, url):
        if url in self._downloads:
            return self._downloads[url]
        return self.uploaded[url.removeprefix("https://blob/")]

    async def download_file(self, container, blob_path):
        if blob_path not in self._downloads:
            raise ResourceNotFoundError(blob_path)
        return self._downloads[blob_path]

    async def download_chunks(self, container, blob_path):
        if blob_path not in self._downloads:
            raise ResourceNotFoundError(blob_path)
        return _chunked(self._downloads[blob_path])

    async def download_chunks_from_url(self, url):
        return _chunked(self._downloads[url])

    async def blob_size(self, container, blob_path):
        if blob_path not in self._downloads:
            raise ResourceNotFoundError(blob_path)
        return len(self._downloads[blob_path])


@pytest.mark.asyncio
async def test_remediation_access_allows_the_content_roles_and_blocks_teachers():
    for role in ("tenant", "school_admin", "content_creator"):
        assert await require_remediation_access(user={"role": role}) == {"role": role}
    with pytest.raises(ForbiddenError):
        await require_remediation_access(user={"role": "teacher"})


@pytest.mark.asyncio
async def test_create_job_uploads_the_pdf_and_stores_its_url(repo):
    blob = _StubBlob()
    result = await create_remediation_job(
        file=_StubUpload(b"%PDF-1.7 body"), language="kn", target_language="",
        user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=blob
    )
    job = await repo.get("tenant-a", result["job_id"])
    assert job.source_url == f"https://blob/textbook-remediation/{job.job_id}/source.pdf"
    assert (job.status, job.language, job.source_name) == ("pending", "kn", "book.pdf")
    assert blob.uploaded[f"textbook-remediation/{job.job_id}/source.pdf"] == b"%PDF-1.7 body"
    assert job.target_language is None


@pytest.mark.asyncio
async def test_create_job_stores_the_target_language_when_given(repo):
    result = await create_remediation_job(
        file=_StubUpload(b"%PDF-1.7 body"), language="kn", target_language="hi",
        user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=_StubBlob()
    )
    job = await repo.get("tenant-a", result["job_id"])
    assert job.target_language == "hi"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("upload", "language", "message"),
    [
        (_StubUpload(b"%PDF-1.7", content_type="text/plain"), "en", "Expected a PDF"),
        (_StubUpload(b"MZ not a pdf"), "en", "not a PDF"),
        (_StubUpload(b"%PDF-1.7"), "kn; rm -rf /", "is not a supported language"),
    ],
)
async def test_create_job_rejects_bad_input(repo, upload, language, message):
    with pytest.raises(ValidationError, match=message):
        await create_remediation_job(
            file=upload, language=language, user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=_StubBlob()
        )


@pytest.mark.asyncio
async def test_artifact_bytes_rejects_an_unknown_name(repo):
    job = await _create(repo)
    with pytest.raises(ValidationError, match="Unknown artifact"):
        await _artifact_bytes(job, "../secrets", _StubBlob())


@pytest.mark.asyncio
async def test_artifact_bytes_404s_before_the_stage_that_writes_it_has_run(repo):
    job = await _create(repo)
    with pytest.raises(NotFoundError):
        await _artifact_bytes(job, "docx", _StubBlob())


@pytest.mark.asyncio
async def test_artifact_bytes_serves_the_recorded_url(repo):
    created = await _create(repo)
    job = await repo.record_artifacts(created.job_id, {"corrected": "https://blob/c.md"}, {})
    data, content_type = await _artifact_bytes(job, "corrected", _StubBlob({"https://blob/c.md": b"# hello"}))
    assert (data, content_type) == (b"# hello", "text/markdown")


@pytest.mark.asyncio
async def test_artifact_bytes_resolves_source_to_the_job_source_url(repo):
    created = await _create(repo)
    data, content_type = await _artifact_bytes(
        created, "source", _StubBlob({"https://blob/source.pdf": b"%PDF-1.7 source bytes"})
    )
    assert (data, content_type) == (b"%PDF-1.7 source bytes", "application/pdf")


@pytest.mark.asyncio
async def test_get_remediation_artifact_serves_the_source_pdf_to_the_owning_tenant(repo):
    created = await _create(repo)
    response = await get_remediation_artifact(
        created.job_id, "source",
        user={"tenant_id": "tenant-a"}, repo=repo,
        blob_provider=_StubBlob({"https://blob/source.pdf": b"%PDF-1.7 source bytes"}),
    )
    body = b"".join([chunk async for chunk in response.body_iterator])
    assert body == b"%PDF-1.7 source bytes"
    assert response.media_type == "application/pdf"


@pytest.mark.asyncio
async def test_get_remediation_artifact_blocks_a_different_tenant_from_the_source_pdf(repo):
    created = await _create(repo)
    with pytest.raises(NotFoundError):
        await get_remediation_artifact(
            created.job_id, "source",
            user={"tenant_id": "tenant-b"}, repo=repo, blob_provider=_StubBlob(),
        )


@pytest.mark.asyncio
async def test_get_remediation_image_serves_the_owning_tenant(repo):
    created = await _create(repo)
    blob_path = f"textbook-remediation/{created.job_id}/images/fig1.png"
    response = await get_remediation_image(
        created.job_id, "fig1.png",
        user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=_StubBlob({blob_path: b"png-bytes"}),
    )
    body = b"".join([chunk async for chunk in response.body_iterator])
    assert body == b"png-bytes"


@pytest.mark.asyncio
async def test_get_remediation_image_blocks_a_different_tenant(repo):
    created = await _create(repo)
    with pytest.raises(NotFoundError):
        await get_remediation_image(
            created.job_id, "fig1.png",
            user={"tenant_id": "tenant-b"}, repo=repo, blob_provider=_StubBlob(),
        )


@pytest.mark.asyncio
async def test_get_remediation_page_serves_the_owning_tenant(repo):
    created = await _create(repo)
    await repo.update_source_page_count(created.job_id, 2)
    blob_path = f"textbook-remediation/{created.job_id}/pages/1.jpg"
    response = await get_remediation_page(
        created.job_id, 1,
        user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=_StubBlob({blob_path: b"jpg-bytes"}),
    )
    body = b"".join([chunk async for chunk in response.body_iterator])
    assert body == b"jpg-bytes"
    assert response.media_type == "image/jpeg"


@pytest.mark.asyncio
async def test_get_remediation_page_blocks_a_different_tenant(repo):
    created = await _create(repo)
    await repo.update_source_page_count(created.job_id, 2)
    with pytest.raises(NotFoundError):
        await get_remediation_page(
            created.job_id, 1,
            user={"tenant_id": "tenant-b"}, repo=repo, blob_provider=_StubBlob(),
        )


@pytest.mark.asyncio
async def test_get_remediation_page_404s_out_of_range(repo):
    created = await _create(repo)
    await repo.update_source_page_count(created.job_id, 2)
    with pytest.raises(NotFoundError):
        await get_remediation_page(
            created.job_id, 3,
            user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=_StubBlob(),
        )
    with pytest.raises(NotFoundError):
        await get_remediation_page(
            created.job_id, 0,
            user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=_StubBlob(),
        )


@pytest.mark.asyncio
async def test_get_remediation_page_404s_when_job_has_no_page_images(repo):
    created = await _create(repo)
    with pytest.raises(NotFoundError):
        await get_remediation_page(
            created.job_id, 1,
            user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=_StubBlob(),
        )


@pytest.mark.asyncio
async def test_save_draft_and_verify_job(repo):
    created = await _create(repo)
    blob = _StubBlob()
    res = await save_remediation_draft(
        created.job_id,
        DraftUpdateRequest(draft_md="# Corrected title\n\nParagraph text"),
        user={"tenant_id": "tenant-a"},
        repo=repo,
        blob_provider=blob,
    )
    assert res["status"] == "in_review"
    assert res["draft_remediated_md"] == "# Corrected title\n\nParagraph text"
    assert f"textbook-remediation/{created.job_id}/remediated.draft.md" in blob.uploaded

    verified = await verify_remediation_job(
        created.job_id,
        VerifyJobRequest(title="TN Maths Grade 5 Verified"),
        user={"tenant_id": "tenant-a", "email": "reviewer@seeds.org"},
        repo=repo,
        blob_provider=blob,
    )
    assert verified["status"] == "verified"
    assert verified["title"] == "TN Maths Grade 5 Verified"
    assert verified["verified_by"] == "reviewer@seeds.org"
    assert verified["verified_at"] is not None


@pytest.mark.asyncio
async def test_review_summary(repo):
    created = await _create(repo)
    summary = await get_review_summary(
        created.job_id,
        user={"tenant_id": "tenant-a"},
        repo=repo,
        blob_provider=_StubBlob(),
    )
    assert summary["job_id"] == created.job_id
    assert "diagrams_described_count" in summary
    assert "flagged_items_count" in summary


@pytest.mark.asyncio
async def test_review_summary_skips_a_null_rule_without_dropping_later_rows(repo):
    created = await _create(repo)
    job = await repo.record_artifacts(created.job_id, {"remediation": "https://blob/r.jsonl"}, {})
    lines = "\n".join([
        json.dumps({"rule": None}),
        json.dumps({"rule": "table_summary", "id": "t1"}),
    ])
    summary = await get_review_summary(
        job.job_id,
        user={"tenant_id": "tenant-a"},
        repo=repo,
        blob_provider=_StubBlob({"https://blob/r.jsonl": lines.encode("utf-8")}),
    )
    assert [t["id"] for t in summary["tables"]] == ["t1"]


@pytest.mark.asyncio
async def test_review_summary_reassembles_lines_split_across_chunks(repo):
    created = await _create(repo)
    alt = "\n".join([
        json.dumps({"id": "d1", "image_name": "fig1.png", "alt_text": "A chart"}),
        json.dumps({"id": "d2", "image_name": "fig2.png", "alt_text": "A graph"}),
    ])
    unresolved = json.dumps({"id": "u1", "type": "unresolved_figure", "reason": "blurry"})
    remediation = "\n".join([
        json.dumps({"rule": "table_summary", "id": "t1"}),
        json.dumps({"rule": "other"}),
    ])
    job = await repo.record_artifacts(created.job_id, {
        "alt": "https://blob/alt.jsonl",
        "unresolved": "https://blob/unresolved.jsonl",
        "remediation": "https://blob/remediation.jsonl",
    }, {})
    blob = _StubBlob({
        "https://blob/alt.jsonl": alt.encode("utf-8"),
        "https://blob/unresolved.jsonl": unresolved.encode("utf-8"),
        "https://blob/remediation.jsonl": remediation.encode("utf-8"),
    })
    summary = await get_review_summary(job.job_id, user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=blob)
    assert [d["id"] for d in summary["diagrams"]] == ["d1", "d2"]
    assert [f["id"] for f in summary["flagged_items"]] == ["u1"]
    assert [t["id"] for t in summary["tables"]] == ["t1"]
    assert summary["incomplete"] is False


@pytest.mark.asyncio
async def test_iter_jsonl_lines_reassembles_a_line_split_across_chunks():
    from app.services.textbook_remediation import _iter_jsonl_lines

    async def chunks():
        yield b'{"id": 1, "na'
        yield b'me": "a"}\n{"id": 2}\n'

    lines = [json.loads(line) async for line in _iter_jsonl_lines(chunks())]
    assert lines == [{"id": 1, "name": "a"}, {"id": 2}]


@pytest.mark.asyncio
async def test_findings_page_pages_correctly_across_chunk_boundaries(repo):
    from app.services.textbook_remediation import findings_page

    created = await _create(repo)
    job = await repo.record_artifacts(created.job_id, {"findings": "https://blob/f.jsonl"}, {})
    lines = "\n".join(json.dumps({"id": i}) for i in range(5))
    blob = _StubBlob({"https://blob/f.jsonl": lines.encode("utf-8")})
    page = await findings_page(job, "findings", blob, limit=2, offset=1)
    assert [f["id"] for f in page["findings"]] == [1, 2]
    assert (page["total"], page["offset"], page["has_more"]) == (5, 1, True)


def test_platform_root_path():
    from app.remediation.run_pipeline import PLATFORM_ROOT

    assert PLATFORM_ROOT.name == "platform"
    assert (PLATFORM_ROOT / "app").is_dir()
    assert (PLATFORM_ROOT / "app" / "remediation").is_dir()


class _FailingBlob:
    async def upload_file(self, *args, **kwargs):
        raise RuntimeError("blob storage is down")


@pytest.mark.asyncio
async def test_create_job_inserts_nothing_when_the_upload_fails(repo):
    import io

    from app.services.textbook_remediation import create_job

    with pytest.raises(RuntimeError, match="blob storage is down"):
        await create_job(
            repo, _FailingBlob(),
            tenant_id="tenant-a", source_name="book.pdf",
            data=io.BytesIO(b"%PDF-1.7"), language="kn", target_language=None,
        )
    assert await repo.list_jobs("tenant-a") == []


@pytest.mark.asyncio
async def test_consumer_upload_raises_when_a_required_artifact_is_missing(tmp_path):
    from app.consumers.textbook_remediation_consumer import _upload
    from app.models.remediation_job import ArtifactName

    with pytest.raises(RuntimeError, match="raw.md"):
        await _upload(_StubBlob(), "job1", tmp_path, ArtifactName.RAW)


@pytest.mark.asyncio
async def test_upload_images_marks_an_image_corrupted_after_three_failed_attempts(tmp_path, monkeypatch):
    from unittest.mock import AsyncMock

    from app.consumers.textbook_remediation_consumer import _upload_images
    from app.models.remediation_job import ArtifactName, artifact_filename

    (tmp_path / "fig1.png").write_bytes(b"img-bytes")
    out = tmp_path / "out"
    out.mkdir()
    monkeypatch.setattr("app.consumers.textbook_remediation_consumer.asyncio.sleep", AsyncMock())

    count = await _upload_images(_FailingBlob(), "job1", tmp_path, out)

    assert count == 0
    unresolved = (out / artifact_filename(ArtifactName.UNRESOLVED)).read_text(encoding="utf-8")
    assert "Image upload failed after 3 attempts" in unresolved


@pytest.mark.asyncio
async def test_upload_source_pages_renders_and_uploads_each_page(tmp_path):
    import pymupdf

    from app.consumers.textbook_remediation_consumer import _upload_source_pages

    doc = pymupdf.open()
    doc.new_page()
    doc.new_page()
    pdf_path = tmp_path / "book.pdf"
    doc.save(pdf_path)
    doc.close()

    blob = _StubBlob()
    page_count = await _upload_source_pages(blob, "job1", pdf_path)

    assert page_count == 2
    assert set(blob.uploaded) == {
        "textbook-remediation/job1/pages/1.jpg",
        "textbook-remediation/job1/pages/2.jpg",
    }
    assert all(data[:2] == b"\xff\xd8" for data in blob.uploaded.values())


@pytest.mark.asyncio
async def test_update_source_page_count_stores_the_count(repo):
    job = await _create(repo)
    updated = await repo.update_source_page_count(job.job_id, 2)
    assert updated.source_page_count == 2


@pytest.mark.asyncio
async def test_verify_job_uploads_go_under_the_verified_path(repo, monkeypatch):
    from app.services import textbook_remediation as remediation_service

    created = await _create(repo)
    job = await repo.update_draft(created.job_id, "# Title\n\nBody")

    def _fake_compile(markdown, out_dir):
        docx = out_dir / "remediated.docx"
        docx.write_bytes(b"docx-bytes")
        tex = out_dir / "remediated.tex"
        tex.write_bytes(b"tex-bytes")
        return docx, tex, None

    monkeypatch.setattr(remediation_service, "_compile_verified", _fake_compile)
    blob = _StubBlob()

    await remediation_service.verify_job(repo, blob, job, title="Title", verified_by="reviewer@seeds.org")

    assert f"textbook-remediation/{created.job_id}/verified/remediated.docx" in blob.uploaded
    assert f"textbook-remediation/{created.job_id}/verified/remediated.tex" in blob.uploaded


_YAML_STEPS = """
- agent: safe_extract
  config:
    path: ".metadata.verified"
    model: ${{.config.verify_model}}
- agent: safe_extract
  config:
    path: ".metadata.accessibility"
    model: ${{.config.verify_model}}
- agent: safe_extract
  config:
    path: ".metadata.remediation"
{block_tree_config}
"""


def _write_pipeline_yaml(tmp_path, block_tree_model_line=""):
    content = "parameters:\n  properties:\n    verify_model:\n      default: azure-responses:gpt-4.1-mini\nsteps:" + \
        _YAML_STEPS.format(block_tree_config=block_tree_model_line)
    path = tmp_path / "pipeline.yaml"
    path.write_text(content, encoding="utf-8")
    return path


def test_resolve_models_falls_back_to_omni_default_when_block_tree_step_has_no_model(monkeypatch, tmp_path):
    path = _write_pipeline_yaml(tmp_path, "")
    monkeypatch.setattr("app.consumers.textbook_remediation_consumer.PIPELINE_PATH", path)
    monkeypatch.setattr("app.consumers.textbook_remediation_consumer.omni_settings.default_chat_completion_model", "omni-default")
    monkeypatch.setattr("app.consumers.textbook_remediation_consumer.get_settings", lambda: SimpleNamespace(mistral_ocr_model=None))
    monkeypatch.delenv("MISTRAL_OCR_MODEL", raising=False)
    job = RemediationJob(
        job_id="j", tenant_id="t", source_name="book.pdf", source_url="u", language="kn", status="running", stage="ocr",
    )
    models = _resolve_models(job)
    assert models.verify == "azure-responses:gpt-4.1-mini"
    assert models.alt_text == "azure-responses:gpt-4.1-mini"
    assert models.block_tree == "omni-default"
    assert models.ocr is None
    assert models.translation is None


def test_resolve_models_reads_block_tree_model_when_step_declares_it(monkeypatch, tmp_path):
    path = _write_pipeline_yaml(tmp_path, '    model: ${.config.verify_model}\n')
    monkeypatch.setattr("app.consumers.textbook_remediation_consumer.PIPELINE_PATH", path)
    job = RemediationJob(
        job_id="j", tenant_id="t", source_name="book.pdf", source_url="u", language="kn", status="running", stage="ocr",
    )
    models = _resolve_models(job)
    assert models.block_tree == "azure-responses:gpt-4.1-mini"


def test_resolve_models_sets_translation_when_target_language_requested(monkeypatch, tmp_path):
    path = _write_pipeline_yaml(tmp_path, "")
    monkeypatch.setattr("app.consumers.textbook_remediation_consumer.PIPELINE_PATH", path)
    job = RemediationJob(
        job_id="j", tenant_id="t", source_name="book.pdf", source_url="u", language="kn", status="running", stage="ocr",
        target_language="hi",
    )
    models = _resolve_models(job)
    assert models.translation == "azure"


@pytest.mark.asyncio
async def test_verify_job_appends_an_edit_record_against_the_remediated_artifact(repo, monkeypatch):
    from app.services import textbook_remediation as remediation_service

    monkeypatch.setattr(remediation_service, "_compile_verified", lambda markdown, out_dir: (None, None, None))
    created = await _create(repo)
    job = await repo.record_artifacts(created.job_id, {"remediated": "https://blob/remediated.md"}, {})
    job = await repo.update_draft(job.job_id, "# Edited once", "https://blob/draft.md")
    blob = _StubBlob({"https://blob/remediated.md": b"# Original"})

    await remediation_service.verify_job(repo, blob, job, title="Title", verified_by="reviewer@seeds.org", edited_by="teacher@seeds.org")

    edits_blob = blob.uploaded[f"textbook-remediation/{job.job_id}/remediated.edits.jsonl"]
    record = json.loads(edits_blob.decode("utf-8").strip())
    assert (record["previous"], record["new"], record["edited_by"]) == ("# Original", "# Edited once", "teacher@seeds.org")


@pytest.mark.asyncio
async def test_verify_job_appends_a_second_record_on_a_repeat_verification(repo, monkeypatch):
    from app.services import textbook_remediation as remediation_service

    monkeypatch.setattr(remediation_service, "_compile_verified", lambda markdown, out_dir: (None, None, None))
    created = await _create(repo)
    job = await repo.record_artifacts(created.job_id, {"remediated": "https://blob/remediated.md"}, {})
    job = await repo.update_draft(job.job_id, "# Edited once", "https://blob/draft.md")
    blob = _StubBlob({"https://blob/remediated.md": b"# Original"})

    job = await remediation_service.verify_job(repo, blob, job, title="Title", verified_by="reviewer@seeds.org", edited_by="teacher@seeds.org")
    job = await repo.update_draft(job.job_id, "# Edited twice", "https://blob/draft.md")
    job = await remediation_service.verify_job(repo, blob, job, title="Title", verified_by="reviewer@seeds.org", edited_by="teacher@seeds.org")

    edits_blob = blob.uploaded[f"textbook-remediation/{job.job_id}/remediated.edits.jsonl"]
    lines = [json.loads(line) for line in edits_blob.decode("utf-8").splitlines()]
    assert len(lines) == 2
    assert (lines[1]["previous"], lines[1]["new"]) == ("# Original", "# Edited twice")

