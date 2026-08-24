from __future__ import annotations

import pytest

from app.models.remediation_job import STAGES, RemediationJob
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository
from app.services.textbook_remediation import serialize_job, subscribe
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    return TextbookRemediationRepository(AsyncMongoMockClient()["test_seeds"])


async def _create(repo, job_id="job-1", tenant_id="tenant-a"):
    return await repo.create(
        job_id, tenant_id=tenant_id, source_name="book.pdf", source_url="https://blob/source.pdf", language="kn"
    )


@pytest.mark.asyncio
async def test_create_starts_pending_with_no_stage(repo):
    job = await _create(repo)
    assert (job.status, job.stage, job.artifacts, job.counts) == ("pending", None, {}, {})
    assert (await repo.get("tenant-a", "job-1")).source_name == "book.pdf"


@pytest.mark.asyncio
async def test_get_is_tenant_scoped(repo):
    await _create(repo)
    assert await repo.get("tenant-b", "job-1") is None


@pytest.mark.asyncio
async def test_claim_moves_one_job_to_running_at_ocr(repo):
    await _create(repo)
    claimed = await repo.claim_next_pending()
    assert (claimed.job_id, claimed.status, claimed.stage) == ("job-1", "running", "ocr")
    assert await repo.claim_next_pending() is None


@pytest.mark.asyncio
async def test_record_artifacts_merges_rather_than_replaces(repo):
    await _create(repo)
    await repo.record_artifacts("job-1", {"raw": "https://blob/raw.md"}, {"raw_chars": 10})
    job = await repo.record_artifacts("job-1", {"docx": "https://blob/d.docx"}, {"findings": 3})
    assert job.artifacts == {"raw": "https://blob/raw.md", "docx": "https://blob/d.docx"}
    assert job.counts == {"raw_chars": 10, "findings": 3}


@pytest.mark.asyncio
async def test_finish_records_status_and_error(repo):
    await _create(repo)
    job = await repo.finish("job-1", "failed", error="ocr failed")
    assert (job.status, job.error) == ("failed", "ocr failed")
    assert job.finished_at is not None


@pytest.mark.asyncio
async def test_reconcile_fails_jobs_stranded_by_a_restart(repo):
    await _create(repo)
    await repo.claim_next_pending()
    assert await repo.reconcile_interrupted_jobs() == 1
    assert (await repo.get("tenant-a", "job-1")).status == "failed"


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
    await _create(repo)
    await repo.finish("job-1", "completed")
    events = [e async for e in subscribe(repo, "tenant-a", "job-1", interval=0)]
    assert [e["event"] for e in events] == ["done"]


@pytest.mark.asyncio
async def test_subscribe_yields_each_change_then_done(repo):
    await _create(repo)
    await repo.claim_next_pending()

    events = []
    async for event in subscribe(repo, "tenant-a", "job-1", interval=0):
        events.append(event)
        if len(events) == 1:
            await repo.set_stage("job-1", "review")
        elif len(events) == 2:
            await repo.finish("job-1", "completed")
    assert [e["event"] for e in events] == ["progress", "progress", "done"]
    assert [e["job"]["stage"] for e in events] == ["ocr", "review", "review"]


@pytest.mark.asyncio
async def test_subscribe_stops_on_an_unknown_job(repo):
    assert [e async for e in subscribe(repo, "tenant-a", "nope", interval=0)] == []


from app.controllers.textbook_remediation_controller import (  # noqa: E402
    _artifact_bytes,
    create_remediation_job,
    require_remediation_access,
)
from app.platform.error_handling import ForbiddenError, NotFoundError, ValidationError  # noqa: E402


class _StubUpload:
    def __init__(self, data: bytes, content_type: str = "application/pdf", filename: str = "book.pdf"):
        self._data, self.content_type, self.filename = data, content_type, filename

    async def read(self, size: int = -1) -> bytes:
        return self._data[:size] if size >= 0 else self._data


class _StubBlob:
    def __init__(self, downloads: dict[str, bytes] | None = None):
        self.uploaded: dict[str, bytes] = {}
        self._downloads = downloads or {}

    async def upload_file(self, container, blob_name, data, content_type):
        self.uploaded[blob_name] = data
        return f"https://blob/{blob_name}"

    async def download_from_url(self, url):
        return self._downloads[url]


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
        file=_StubUpload(b"%PDF-1.7 body"), language="kn", user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=blob
    )
    job = await repo.get("tenant-a", result["job_id"])
    assert job.source_url == f"https://blob/textbook-remediation/{job.job_id}/source.pdf"
    assert (job.status, job.language, job.source_name) == ("pending", "kn", "book.pdf")
    assert blob.uploaded[f"textbook-remediation/{job.job_id}/source.pdf"] == b"%PDF-1.7 body"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("upload", "language", "message"),
    [
        (_StubUpload(b"%PDF-1.7", content_type="text/plain"), "en", "Expected a PDF"),
        (_StubUpload(b"MZ not a pdf"), "en", "not a PDF"),
        (_StubUpload(b"%PDF-1.7"), "kn; rm -rf /", "Not a language tag"),
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
    await _create(repo)
    job = await repo.record_artifacts("job-1", {"corrected": "https://blob/c.md"}, {})
    data, content_type = await _artifact_bytes(job, "corrected", _StubBlob({"https://blob/c.md": b"# hello"}))
    assert (data, content_type) == (b"# hello", "text/markdown")
