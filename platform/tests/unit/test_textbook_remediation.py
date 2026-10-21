from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from bson import ObjectId

from app.models.remediation_job import STAGES, JobStage, JobStatus, RemediationJob
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository
from app.services.textbook_remediation import serialize_job, subscribe
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    return TextbookRemediationRepository(AsyncMongoMockClient()["test_seeds"])


async def _create(repo, tenant_id="tenant-a"):
    return await repo.create(
        job_id=ObjectId(), tenant_id=tenant_id, source_name="book.pdf",
        source_url="https://blob/source.pdf", language="kn", created_by="tester",
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


_TENANT_USER = {"role": "tenant", "tenant_id": "tenant-a", "sub": "admin-1"}


@pytest.mark.asyncio
async def test_subscribe_ends_on_a_finished_job(repo):
    job = await _create(repo)
    await repo.finish(job.job_id, JobStatus.READY_TO_REVIEW)
    events = [e async for e in subscribe(repo, _TENANT_USER, job.job_id, interval=0)]
    assert [e["event"] for e in events] == ["done"]


@pytest.mark.asyncio
async def test_subscribe_yields_each_change_then_done(repo):
    job = await _create(repo)
    await repo.claim_next_pending()

    events = []
    async for event in subscribe(repo, _TENANT_USER, job.job_id, interval=0):
        events.append(event)
        if len(events) == 1:
            await repo.set_stage(job.job_id, JobStage.REVIEW)
        elif len(events) == 2:
            await repo.finish(job.job_id, JobStatus.READY_TO_REVIEW)
    assert [e["event"] for e in events] == ["progress", "progress", "done"]
    assert [e["job"]["stage"] for e in events] == ["ocr", "review", "review"]


@pytest.mark.asyncio
async def test_subscribe_stops_on_an_unknown_job(repo):
    assert [e async for e in subscribe(repo, _TENANT_USER, "000000000000000000000000", interval=0)] == []


@pytest.mark.asyncio
async def test_subscribe_stops_once_a_volunteer_is_unassigned(repo):
    job = await _create(repo)
    await repo.claim_next_pending()
    await repo.set_assignment("tenant-a", job.job_id, "vol-1")
    volunteer = {"role": "textbook_remediation_volunteer", "tenant_id": "tenant-a", "sub": "vol-1"}

    events = []
    async for event in subscribe(repo, volunteer, job.job_id, interval=0):
        events.append(event)
        if len(events) == 1:
            await repo.set_assignment("tenant-a", job.job_id, None)
    assert [e["event"] for e in events] == ["progress"]


from app.controllers.textbook_remediation_controller import (  # noqa: E402
    AssignJobRequest,
    DraftUpdateRequest,
    TranslateJobRequest,
    VerifyJobRequest,
    _artifact_bytes,
    _get_job,
    assign_remediation_job,
    create_remediation_job,
    delete_remediation_job,
    get_remediation_artifact,
    get_remediation_findings,
    get_remediation_image,
    get_remediation_job,
    get_review_summary,
    list_remediation_jobs,
    require_remediation_access,
    save_remediation_draft,
    stream_remediation_job,
    translate_remediation_job,
    verify_remediation_job,
)
from app.models.user import UserRole  # noqa: E402
from app.platform.error_handling import ForbiddenError, NotFoundError, ValidationError  # noqa: E402


class _StubUpload:
    def __init__(self, data: bytes, content_type: str = "application/pdf", filename: str = "book.pdf"):
        import io

        self.file = io.BytesIO(data)
        self.content_type, self.filename = content_type, filename

    async def read(self, size: int = -1) -> bytes:
        return self.file.read(size)

    async def seek(self, offset: int) -> None:
        self.file.seek(offset)


class _StubBlob:
    def __init__(self, downloads: dict[str, bytes] | None = None):
        self.uploaded: dict[str, bytes] = {}
        self._downloads = downloads or {}

    async def upload_file(self, container, blob_name, data, content_type):
        self.uploaded[blob_name] = data.read() if hasattr(data, "read") else data
        return f"https://blob/{blob_name}"

    async def download_from_url(self, url):
        return self._downloads[url]

    async def download_file(self, container, blob_path):
        return self._downloads[blob_path]


@pytest.mark.asyncio
async def test_remediation_access_allows_the_content_roles_and_blocks_teachers():
    for role in ("tenant", "school_admin", "content_creator"):
        assert await require_remediation_access(user={"role": role}) == {"role": role}
    with pytest.raises(ForbiddenError):
        await require_remediation_access(user={"role": "teacher"})


@pytest.mark.asyncio
async def test_remediation_access_allows_the_textbook_remediation_volunteer():
    user = {"role": "textbook_remediation_volunteer"}
    assert await require_remediation_access(user=user) == user


@pytest.mark.asyncio
async def test_remediation_management_requires_the_tenant_role():
    import inspect

    from app.platform.auth.dependencies import require_tenant

    for fn in (create_remediation_job, delete_remediation_job, assign_remediation_job):
        assert inspect.signature(fn).parameters["user"].default.dependency is require_tenant

    for role in ("school_admin", "content_creator", "textbook_remediation_volunteer", "teacher"):
        with pytest.raises(ForbiddenError):
            await require_tenant(user={"role": role})
    assert await require_tenant(user={"role": "tenant"}) == {"role": "tenant"}


@pytest.mark.asyncio
async def test_list_jobs_is_tenant_scoped(repo):
    job = await _create(repo)
    assert [j.job_id for j in await repo.list_jobs("tenant-a")] == [job.job_id]
    assert await repo.list_jobs("tenant-b") == []


async def _create_other(repo, tenant_id="tenant-a"):
    return await repo.create(
        job_id=ObjectId(), tenant_id=tenant_id, source_name="other.pdf",
        source_url="https://blob/other.pdf", language="kn", created_by="tester",
    )


@pytest.mark.asyncio
async def test_list_jobs_repo_filters_by_assigned_to(repo):
    assigned = await _create(repo)
    await _create_other(repo)
    await repo.set_assignment("tenant-a", assigned.job_id, "vol-1")
    jobs = await repo.list_jobs("tenant-a", assigned_to="vol-1")
    assert [j.job_id for j in jobs] == [assigned.job_id]


@pytest.mark.asyncio
async def test_list_remediation_jobs_returns_only_assigned_jobs_for_a_volunteer(repo):
    assigned = await _create(repo)
    await _create_other(repo)
    await repo.set_assignment("tenant-a", assigned.job_id, "vol-1")
    user = {"role": "textbook_remediation_volunteer", "tenant_id": "tenant-a", "sub": "vol-1"}
    result = await list_remediation_jobs(limit=20, user=user, repo=repo)
    assert [j["job_id"] for j in result["jobs"]] == [assigned.job_id]


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["tenant", "school_admin", "content_creator"])
async def test_list_remediation_jobs_returns_all_tenant_jobs_for_admin_roles(repo, role):
    job_a = await _create(repo)
    job_b = await _create_other(repo)
    await repo.set_assignment("tenant-a", job_a.job_id, "vol-1")
    user = {"role": role, "tenant_id": "tenant-a", "sub": "admin-1"}
    result = await list_remediation_jobs(limit=20, user=user, repo=repo)
    assert {j["job_id"] for j in result["jobs"]} == {job_a.job_id, job_b.job_id}


@pytest.mark.asyncio
async def test_get_job_returns_the_job_for_the_assigned_volunteer(repo):
    created = await _create(repo)
    await repo.set_assignment("tenant-a", created.job_id, "vol-1")
    user = {"role": "textbook_remediation_volunteer", "tenant_id": "tenant-a", "sub": "vol-1"}
    assert (await _get_job(repo, user, created.job_id)).job_id == created.job_id


@pytest.mark.asyncio
async def test_get_job_404s_for_an_unassigned_volunteer(repo):
    created = await _create(repo)
    user = {"role": "textbook_remediation_volunteer", "tenant_id": "tenant-a", "sub": "vol-1"}
    with pytest.raises(NotFoundError):
        await _get_job(repo, user, created.job_id)


@pytest.mark.asyncio
async def test_get_job_404s_for_a_volunteer_assigned_to_someone_else(repo):
    created = await _create(repo)
    await repo.set_assignment("tenant-a", created.job_id, "vol-2")
    user = {"role": "textbook_remediation_volunteer", "tenant_id": "tenant-a", "sub": "vol-1"}
    with pytest.raises(NotFoundError):
        await _get_job(repo, user, created.job_id)


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["tenant", "school_admin", "content_creator"])
async def test_get_job_ignores_assignment_for_admin_roles(repo, role):
    created = await _create(repo)
    user = {"role": role, "tenant_id": "tenant-a", "sub": "admin-1"}
    assert (await _get_job(repo, user, created.job_id)).job_id == created.job_id


@pytest.mark.asyncio
async def test_all_single_job_endpoints_404_for_an_unassigned_volunteer(repo):
    created = await _create(repo)
    user = {"role": "textbook_remediation_volunteer", "tenant_id": "tenant-a", "sub": "vol-1"}
    blob = _StubBlob()

    checks = [
        lambda: get_remediation_job(created.job_id, user=user, repo=repo),
        lambda: stream_remediation_job(created.job_id, user=user, repo=repo),
        lambda: get_remediation_artifact(created.job_id, "docx", user=user, repo=repo, blob_provider=blob),
        lambda: get_remediation_image(created.job_id, "fig1.png", user=user, repo=repo, blob_provider=blob),
        lambda: get_remediation_findings(
            created.job_id, name="findings", limit=50, offset=0, user=user, repo=repo, blob_provider=blob
        ),
        lambda: save_remediation_draft(
            created.job_id, DraftUpdateRequest(draft_md="x"), user=user, repo=repo, blob_provider=blob
        ),
        lambda: verify_remediation_job(
            created.job_id, VerifyJobRequest(title="x"), user=user, repo=repo, blob_provider=blob
        ),
        lambda: translate_remediation_job(
            created.job_id, TranslateJobRequest(target_language="hi"), user=user, repo=repo, blob_provider=blob
        ),
        lambda: get_review_summary(created.job_id, user=user, repo=repo, blob_provider=blob),
    ]
    for check in checks:
        with pytest.raises(NotFoundError):
            await check()


@pytest.mark.asyncio
async def test_get_job_fails_closed_when_the_volunteer_token_has_no_sub(repo):
    created = await _create(repo)
    user = {"role": "textbook_remediation_volunteer", "tenant_id": "tenant-a"}
    with pytest.raises(KeyError):
        await _get_job(repo, user, created.job_id)


class _StubDb:
    def __getitem__(self, _key):
        return None


class _FakeUserRepo:
    def __init__(self, _db, *, user=None):
        self._user = user

    async def find_by_id(self, _user_id):
        return self._user


def _fake_volunteer(tenant_id="tenant-a"):
    return SimpleNamespace(id="vol-1", role=UserRole.TEXTBOOK_REMEDIATION_VOLUNTEER, tenant_id=tenant_id)


@pytest.mark.asyncio
async def test_assign_sets_assigned_to_for_a_valid_volunteer(repo, monkeypatch):
    created = await _create(repo)
    monkeypatch.setattr(
        "app.controllers.textbook_remediation_controller.UserRepository",
        lambda db: _FakeUserRepo(db, user=_fake_volunteer()),
    )
    user = {"role": "tenant", "tenant_id": "tenant-a", "sub": "admin-1"}
    result = await assign_remediation_job(
        created.job_id, AssignJobRequest(volunteer_id="vol-1"), user=user, repo=repo, db=None,
    )
    assert result["assigned_to"] == "vol-1"


@pytest.mark.asyncio
async def test_assign_rejects_a_volunteer_from_another_tenant(repo, monkeypatch):
    created = await _create(repo)
    monkeypatch.setattr(
        "app.controllers.textbook_remediation_controller.UserRepository",
        lambda db: _FakeUserRepo(db, user=_fake_volunteer(tenant_id="tenant-b")),
    )
    user = {"role": "tenant", "tenant_id": "tenant-a", "sub": "admin-1"}
    with pytest.raises(ValidationError):
        await assign_remediation_job(
            created.job_id, AssignJobRequest(volunteer_id="vol-1"), user=user, repo=repo, db=None,
        )


@pytest.mark.asyncio
async def test_assign_rejects_a_non_volunteer_target(repo, monkeypatch):
    created = await _create(repo)
    monkeypatch.setattr(
        "app.controllers.textbook_remediation_controller.UserRepository",
        lambda db: _FakeUserRepo(db, user=SimpleNamespace(id="t1", role=UserRole.TEACHER, tenant_id="tenant-a")),
    )
    user = {"role": "tenant", "tenant_id": "tenant-a", "sub": "admin-1"}
    with pytest.raises(ValidationError):
        await assign_remediation_job(
            created.job_id, AssignJobRequest(volunteer_id="t1"), user=user, repo=repo, db=None,
        )


@pytest.mark.asyncio
async def test_assign_rejects_a_nonexistent_target(repo, monkeypatch):
    created = await _create(repo)
    monkeypatch.setattr(
        "app.controllers.textbook_remediation_controller.UserRepository",
        lambda db: _FakeUserRepo(db, user=None),
    )
    user = {"role": "tenant", "tenant_id": "tenant-a", "sub": "admin-1"}
    with pytest.raises(ValidationError):
        await assign_remediation_job(
            created.job_id, AssignJobRequest(volunteer_id="missing"), user=user, repo=repo, db=None,
        )


@pytest.mark.asyncio
async def test_unassign_revokes_volunteer_access_immediately(repo):
    created = await _create(repo)
    await repo.set_assignment("tenant-a", created.job_id, "vol-1")
    admin = {"role": "tenant", "tenant_id": "tenant-a", "sub": "admin-1"}
    volunteer = {"role": "textbook_remediation_volunteer", "tenant_id": "tenant-a", "sub": "vol-1"}

    assert (await _get_job(repo, volunteer, created.job_id)).job_id == created.job_id

    result = await assign_remediation_job(
        created.job_id, AssignJobRequest(volunteer_id=None), user=admin, repo=repo, db=_StubDb(),
    )
    assert result["assigned_to"] is None

    with pytest.raises(NotFoundError):
        await _get_job(repo, volunteer, created.job_id)


@pytest.mark.asyncio
async def test_only_a_tenant_can_create_or_list_volunteers():
    from app.platform.auth.dependencies import require_tenant

    assert await require_tenant(user={"role": "tenant"}) == {"role": "tenant"}
    for role in ("school_admin", "content_creator", "teacher", "textbook_remediation_volunteer"):
        with pytest.raises(ForbiddenError):
            await require_tenant(user={"role": role})


@pytest.mark.asyncio
async def test_volunteer_is_rejected_from_non_remediation_endpoints():
    from app.controllers.class_controller import _require_class_access
    from app.controllers.content_aggregator_controller import _require_tenant
    from app.controllers.content_controller import _require_content_read, _require_content_write
    from app.platform.auth.dependencies import require_role, require_tenant

    volunteer = {"role": "textbook_remediation_volunteer"}
    for dependency in (
        _require_content_read,
        _require_content_write,
        _require_tenant,
        require_role("school_admin"),  # school_controller / teacher_controller / student_controller
        _require_class_access,  # class_controller
        require_role("teacher", "content_creator"),  # conference_controller
        require_tenant,  # glossary_controller / translation_controller
    ):
        with pytest.raises(ForbiddenError):
            await dependency(user=volunteer)


@pytest.mark.asyncio
async def test_get_rejects_a_job_from_a_different_tenant(repo):
    job = await _create(repo)
    assert await repo.get("tenant-b", job.job_id) is None


@pytest.mark.asyncio
async def test_create_job_uploads_the_pdf_and_stores_its_url(repo):
    blob = _StubBlob()
    result = await create_remediation_job(
        file=_StubUpload(b"%PDF-1.7 body"), language="kn", target_language="",
        user={"tenant_id": "tenant-a", "sub": "tester"}, repo=repo, blob_provider=blob
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
        user={"tenant_id": "tenant-a", "sub": "tester"}, repo=repo, blob_provider=_StubBlob()
    )
    job = await repo.get("tenant-a", result["job_id"])
    assert job.target_language == "hi"


@pytest.mark.asyncio
async def test_create_job_stores_and_exposes_the_creating_user(repo):
    result = await create_remediation_job(
        file=_StubUpload(b"%PDF-1.7 body"), language="kn", target_language="",
        user={"tenant_id": "tenant-a", "sub": "volunteer@seeds.org"}, repo=repo, blob_provider=_StubBlob()
    )
    job = await repo.get("tenant-a", result["job_id"])
    assert job.created_by == "volunteer@seeds.org"
    assert serialize_job(job)["created_by"] == "volunteer@seeds.org"


@pytest.mark.asyncio
async def test_create_job_uses_sub_even_when_email_and_name_are_present(repo):
    result = await create_remediation_job(
        file=_StubUpload(b"%PDF-1.7 body"), language="kn", target_language="",
        user={"tenant_id": "tenant-a", "sub": "user-123", "email": "decoy@seeds.org", "name": "Decoy"},
        repo=repo, blob_provider=_StubBlob(),
    )
    job = await repo.get("tenant-a", result["job_id"])
    assert job.created_by == "user-123"


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
async def test_get_remediation_image_serves_the_owning_tenant(repo):
    created = await _create(repo)
    blob_path = f"textbook-remediation/{created.job_id}/images/fig1.png"
    response = await get_remediation_image(
        created.job_id, "fig1.png",
        user={"tenant_id": "tenant-a"}, repo=repo, blob_provider=_StubBlob({blob_path: b"png-bytes"}),
    )
    assert response.body == b"png-bytes"


@pytest.mark.asyncio
async def test_get_remediation_image_blocks_a_different_tenant(repo):
    created = await _create(repo)
    with pytest.raises(NotFoundError):
        await get_remediation_image(
            created.job_id, "fig1.png",
            user={"tenant_id": "tenant-b"}, repo=repo, blob_provider=_StubBlob(),
        )


@pytest.mark.asyncio
async def test_save_draft_and_verify_job(repo):
    created = await _create(repo)
    blob = _StubBlob()
    res = await save_remediation_draft(
        created.job_id,
        DraftUpdateRequest(draft_md="# Corrected title\n\nParagraph text"),
        user={"tenant_id": "tenant-a", "sub": "volunteer@seeds.org"},
        repo=repo,
        blob_provider=blob,
    )
    assert res["status"] == "in_review"
    assert res["draft_remediated_md"] == "# Corrected title\n\nParagraph text"
    assert res["last_edited_by"] == "volunteer@seeds.org"
    assert f"textbook-remediation/{created.job_id}/remediated.draft.md" in blob.uploaded

    verified = await verify_remediation_job(
        created.job_id,
        VerifyJobRequest(title="TN Maths Grade 5 Verified"),
        user={"tenant_id": "tenant-a", "sub": "reviewer-1"},
        repo=repo,
        blob_provider=blob,
    )
    assert verified["status"] == "verified"
    assert verified["title"] == "TN Maths Grade 5 Verified"
    assert verified["verified_by"] == "reviewer-1"
    assert verified["verified_at"] is not None


@pytest.mark.asyncio
async def test_verify_job_uses_sub_even_when_email_and_name_are_present(repo):
    created = await _create(repo)
    blob = _StubBlob()
    await save_remediation_draft(
        created.job_id,
        DraftUpdateRequest(draft_md="# Title\n\nBody"),
        user={"tenant_id": "tenant-a", "sub": "reviewer-1"},
        repo=repo,
        blob_provider=blob,
    )
    verified = await verify_remediation_job(
        created.job_id,
        VerifyJobRequest(title="x"),
        user={"tenant_id": "tenant-a", "sub": "reviewer-1", "email": "decoy@seeds.org", "name": "Decoy"},
        repo=repo,
        blob_provider=blob,
    )
    assert verified["verified_by"] == "reviewer-1"


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
            created_by="tester",
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
    assert "Image fig1.png is corrupted" in unresolved


@pytest.mark.asyncio
async def test_verify_job_uploads_go_under_the_verified_path(repo, monkeypatch):
    from app.services import textbook_remediation as remediation_service

    created = await _create(repo)
    job = await repo.update_draft(created.job_id, "# Title\n\nBody", last_edited_by="tester")

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

