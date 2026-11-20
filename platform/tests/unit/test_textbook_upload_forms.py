from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.controllers import textbook_book_controller as books
from app.controllers import textbook_remediation_controller as jobs
from app.platform.auth.dependencies import require_tenant


class _Svc:
    async def create_book(self, tenant_id, payload, files):
        return {"book_id": "b1", "job_ids": [f.filename for f in files]}

    async def create(self, tenant_id, file, payload):
        return {"job_id": file.filename}


def _client():
    app = FastAPI()
    app.include_router(books.router)
    app.include_router(jobs.router)
    app.dependency_overrides[require_tenant] = lambda: {"tenant_id": "t"}
    app.dependency_overrides[books.get_textbook_book_service] = lambda: _Svc()
    app.dependency_overrides[jobs.require_remediation_access] = lambda: {"tenant_id": "t"}
    app.dependency_overrides[jobs.get_textbook_remediation_service] = lambda: _Svc()
    return TestClient(app)


def test_book_upload_reads_flat_form_fields_and_files():
    r = _client().post(
        "/textbook-remediation/books",
        data={"title": "test", "language": "auto", "target_language": ""},
        files=[("files", ("a.pdf", b"x")), ("files", ("b.pdf", b"x"))],
    )
    assert r.status_code == 202, r.text
    assert r.json()["job_ids"] == ["a.pdf", "b.pdf"]


def test_job_upload_reads_flat_form_fields_and_file():
    r = _client().post(
        "/textbook-remediation/jobs",
        data={"language": "auto", "target_language": ""},
        files={"file": ("a.pdf", b"x")},
    )
    assert r.status_code == 202, r.text
    assert r.json() == {"job_id": "a.pdf"}
