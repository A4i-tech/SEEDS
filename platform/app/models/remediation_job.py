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
    "draft": ("remediated.draft.md", "text/markdown"),
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
    detected_language: str | None = None
    artifacts: dict[str, str] = field(default_factory=dict)
    counts: dict[str, int] = field(default_factory=dict)
    metrics: dict[str, object] = field(default_factory=dict)
    progress: dict[str, object] = field(default_factory=dict)
    draft_remediated_md: str | None = None
    verified_at: str | None = None
    verified_by: str | None = None
    title: str | None = None
    error: str | None = None
    created_at: str = ""
    finished_at: str | None = None

    def to_doc(self) -> dict[str, object]:
        return {
            "_id": self.job_id, "tenant_id": self.tenant_id, "source_name": self.source_name,
            "source_url": self.source_url, "language": self.language, "status": self.status,
            "stage": self.stage, "detected_language": self.detected_language,
            "artifacts": self.artifacts, "counts": self.counts,
            "metrics": self.metrics, "progress": self.progress,
            "draft_remediated_md": self.draft_remediated_md,
            "verified_at": self.verified_at, "verified_by": self.verified_by,
            "title": self.title,
            "error": self.error, "created_at": self.created_at,
            "finished_at": self.finished_at,
        }

    @classmethod
    def from_doc(cls, doc: dict[str, object]) -> RemediationJob:
        return cls(
            job_id=doc["_id"], tenant_id=doc["tenant_id"], source_name=doc["source_name"],
            source_url=doc["source_url"], language=doc["language"], status=doc["status"],
            stage=doc["stage"], detected_language=doc.get("detected_language"),
            artifacts=doc.get("artifacts") or {}, counts=doc.get("counts") or {},
            metrics=doc.get("metrics") or {}, progress=doc.get("progress") or {},
            draft_remediated_md=doc.get("draft_remediated_md"),
            verified_at=doc.get("verified_at"), verified_by=doc.get("verified_by"),
            title=doc.get("title"),
            error=doc.get("error"), created_at=doc.get("created_at", ""),
            finished_at=doc.get("finished_at"),
        )

