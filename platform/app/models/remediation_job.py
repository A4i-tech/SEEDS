"""Textbook remediation job domain model.

One job is one PDF walked through three pipeline stages. Kept separate from
SyncJob: that model counts items pulled from an external course catalogue, this
one tracks a fixed sequence of stages over a single uploaded file.
"""
from __future__ import annotations

from dataclasses import dataclass, field

STAGES = ("ocr", "review", "docx")

_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_JSONL = "application/x-ndjson"

ARTIFACTS: dict[str, tuple[str, str]] = {
    "raw": ("raw.md", "text/markdown"),
    "corrected": ("raw.corrected.md", "text/markdown"),
    "findings": ("raw.findings.jsonl", _JSONL),
    "alt": ("raw.alt.jsonl", _JSONL),
    "remediated": ("raw.corrected.remediated.md", "text/markdown"),
    "remediation": ("raw.corrected.remediation.jsonl", _JSONL),
    "unresolved": ("remediated.unresolved.jsonl", _JSONL),
    "docx": ("remediated.docx", _DOCX),
}
"""Artifact key -> (file the pipelines write, content type it is served as).

Keys are the API's names for the artifacts and are deliberately dot-free: they
are Mongo field names under `artifacts`, and a dot there would be read as a
nested path.
"""


@dataclass
class RemediationJob:
    job_id: str
    tenant_id: str
    source_name: str
    source_url: str
    language: str
    status: str
    stage: str | None
    artifacts: dict[str, str] = field(default_factory=dict)
    counts: dict[str, int] = field(default_factory=dict)
    error: str | None = None
    created_at: str = ""
    finished_at: str | None = None

    def to_doc(self) -> dict[str, object]:
        return {
            "_id": self.job_id, "tenant_id": self.tenant_id, "source_name": self.source_name,
            "source_url": self.source_url, "language": self.language, "status": self.status,
            "stage": self.stage, "artifacts": self.artifacts, "counts": self.counts,
            "error": self.error, "created_at": self.created_at,
            "finished_at": self.finished_at,
        }

    @classmethod
    def from_doc(cls, doc: dict[str, object]) -> RemediationJob:
        return cls(
            job_id=doc["_id"], tenant_id=doc["tenant_id"], source_name=doc["source_name"],
            source_url=doc["source_url"], language=doc["language"], status=doc["status"],
            stage=doc["stage"], artifacts=doc["artifacts"], counts=doc["counts"],
            error=doc["error"], created_at=doc["created_at"],
            finished_at=doc["finished_at"],
        )
