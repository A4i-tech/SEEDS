from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.aggregators.models import ContentPayload, ItemType, NodeKind, SourceType
from app.aggregators.sync_job_models import SyncItemResult, SyncJobStatus, SyncScope, SyncStats


class SyncJobResponse(BaseModel):
    job_id: str
    source: SourceType
    scope: SyncScope
    course_id: str
    status: SyncJobStatus
    started_at: str
    finished_at: str
    total_courses: int
    processed: int
    stats: SyncStats
    error: str


class SyncJobListResponse(BaseModel):
    jobs: list[SyncJobResponse]


class SyncJobIdResponse(BaseModel):
    job_id: str


class SyncAllJobsResponse(BaseModel):
    job_ids: dict[SourceType, str]


class SyncJobItemsPageResponse(BaseModel):
    items: list[SyncItemResult]
    next_cursor: str
    total: int


class SyncStreamEvent(BaseModel):
    event: Literal["progress", "done"]
    job: SyncJobResponse


class SyncedCourseSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    org: str
    number: str
    language: str
    hidden: bool
    synced: bool
    last_synced_at: str = Field(alias="lastSyncedAt")
    last_run_id: str = Field(alias="lastRunId")


class CourseListResponse(BaseModel):
    courses: list[SyncedCourseSummary]
    next_cursor: str
    has_more: bool


class DeletedCountResponse(BaseModel):
    deleted: int


class ModifiedCountResponse(BaseModel):
    modified: int


class PartnerContentResponse(BaseModel):
    source_id: str
    root_id: str
    parent_id: str | None
    order: int
    node_kind: NodeKind
    item_type: ItemType | None
    display_name: str
    content: ContentPayload | None
    native_type: str
    last_run_id: str
    fetched_at: str
    created_at: str
    updated_at: str
    is_deleted: bool
    deleted_at: str


class PartnerContentStatusResponse(BaseModel):
    status: Literal["completed"]


class PartnerDeleteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    acknowledged: bool
    matched_count: int = Field(alias="matchedCount")
    modified_count: int = Field(alias="modifiedCount")
