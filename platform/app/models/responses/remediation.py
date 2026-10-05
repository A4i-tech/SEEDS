from __future__ import annotations

from pydantic import BaseModel

from app.models.remediation_job import (
    ArtifactName,
    JobMetrics,
    JobProgress,
    JobStage,
    JobStatus,
)


class RemediationJobResponse(BaseModel):
    job_id: str
    source_name: str
    language: str
    detected_language: str | None
    status: JobStatus
    stage: JobStage | None
    stage_index: int
    stage_count: int
    artifacts: dict[ArtifactName, str]
    counts: dict[str, int]
    metrics: JobMetrics
    progress: JobProgress
    draft_remediated_md: str | None
    verified_at: str | None
    verified_by: str | None
    title: str | None
    error: str | None
    created_at: str
    finished_at: str | None
    target_language: str | None
    translation_error: str | None


class RemediationJobListResponse(BaseModel):
    jobs: list[RemediationJobResponse]


class CreateRemediationJobResponse(BaseModel):
    job_id: str


class DiagramResponse(BaseModel):
    id: str
    page: int
    image_name: str
    alt_text: str
    status: str
    needs_check: bool


class FlaggedItemResponse(BaseModel):
    id: str
    page: int
    type: str
    text: str
    reason: str
    needs_check: bool


class ReviewSummaryResponse(BaseModel):
    job_id: str
    status: JobStatus
    total_pages: int
    diagrams_described_count: int
    tables_fixed_count: int
    flagged_items_count: int
    diagrams: list[DiagramResponse]
    tables: list[dict[str, object]]
    flagged_items: list[FlaggedItemResponse]


class FindingsPageResponse(BaseModel):
    findings: list[dict[str, object]]
    total: int
    offset: int
    has_more: bool
