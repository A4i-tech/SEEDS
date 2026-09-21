from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import PyObjectId


class JobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    READY_TO_REVIEW = "ready_to_review"
    IN_REVIEW = "in_review"
    VERIFIED = "verified"
    FAILED = "failed"


class JobStage(StrEnum):
    OCR = "ocr"
    REVIEW = "review"
    DOCX = "docx"


STAGES: tuple[JobStage, ...] = (JobStage.OCR, JobStage.REVIEW, JobStage.DOCX)


class ArtifactName(StrEnum):
    RAW = "raw"
    CORRECTED = "corrected"
    FINDINGS = "findings"
    ALT = "alt"
    REMEDIATED = "remediated"
    REMEDIATION = "remediation"
    UNRESOLVED = "unresolved"
    DOCX = "docx"
    TEX = "tex"
    PDF = "pdf"
    DRAFT = "draft"
    TRANSLATED_MD = "translated_md"
    TRANSLATED_DOCX = "translated_docx"
    TRANSLATED_TEX = "translated_tex"
    TRANSLATED_PDF = "translated_pdf"


_DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_JSONL_TYPE = "application/x-ndjson"

IMAGE_CONTENT_TYPES: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

ARTIFACTS: dict[ArtifactName, tuple[str, str]] = {
    ArtifactName.RAW: ("raw.md", "text/markdown"),
    ArtifactName.CORRECTED: ("raw.corrected.md", "text/markdown"),
    ArtifactName.FINDINGS: ("raw.findings.jsonl", _JSONL_TYPE),
    ArtifactName.ALT: ("raw.alt.jsonl", _JSONL_TYPE),
    ArtifactName.REMEDIATED: ("raw.corrected.remediated.md", "text/markdown"),
    ArtifactName.REMEDIATION: ("raw.corrected.remediation.jsonl", _JSONL_TYPE),
    ArtifactName.UNRESOLVED: ("remediated.unresolved.jsonl", _JSONL_TYPE),
    ArtifactName.DOCX: ("remediated.docx", _DOCX_TYPE),
    ArtifactName.TEX: ("remediated.tex", "application/x-tex"),
    ArtifactName.PDF: ("remediated.pdf", "application/pdf"),
    ArtifactName.DRAFT: ("remediated.draft.md", "text/markdown"),
    ArtifactName.TRANSLATED_MD: ("translated.md", "text/markdown"),
    ArtifactName.TRANSLATED_DOCX: ("translated.docx", _DOCX_TYPE),
    ArtifactName.TRANSLATED_TEX: ("translated.tex", "application/x-tex"),
    ArtifactName.TRANSLATED_PDF: ("translated.pdf", "application/pdf"),
}


def artifact_filename(name: ArtifactName) -> str:
    return ARTIFACTS[name][0]


class JobProgress(BaseModel):
    stage: str | None = None
    step: str | None = None
    type: str | None = None
    message: str | None = None
    completed: float | None = None
    total: float | None = None
    percent: int | None = None


class JobMetrics(BaseModel):
    total_pages: int | None = None
    processed_pages: int | None = None
    diagrams_described: int | None = None
    tables_fixed: int | None = None
    flagged_items_count: int | None = None


class RemediationJob(BaseModel):
    model_config = ConfigDict(use_enum_values=True, populate_by_name=True)

    job_id: PyObjectId = Field(alias="_id")
    tenant_id: str
    source_name: str
    source_url: str
    language: str
    status: JobStatus
    stage: JobStage | None
    detected_language: str | None = None
    artifacts: dict[ArtifactName, str] = Field(default_factory=dict)
    counts: dict[str, int] = Field(default_factory=dict)
    metrics: JobMetrics = Field(default_factory=JobMetrics)
    progress: JobProgress = Field(default_factory=JobProgress)
    draft_remediated_md: str | None = None
    verified_at: str | None = None
    verified_by: str | None = None
    title: str | None = None
    error: str | None = None
    created_at: str = ""
    finished_at: str | None = None
    target_language: str | None = None
    translation_error: str | None = None
    deleted_at: str | None = None

    def to_doc(self) -> dict[str, object]:
        return self.model_dump(mode="json", by_alias=True)

    @classmethod
    def from_doc(cls, doc: dict[str, object]) -> RemediationJob:
        return cls.model_validate(doc)
