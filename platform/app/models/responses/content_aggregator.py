from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.aggregators.models import SourceType
from app.aggregators.sync_job_models import SyncItemResult, SyncJobStatus, SyncScope, SyncStats
from app.models.content import Content


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


class PartnerPagination(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    next_cursor: str | None = Field(None, alias="nextCursor")
    has_more: bool = Field(False, alias="hasMore")
    limit: int


class PartnerContentPageResponse(BaseModel):
    data: list[Content]
    pagination: PartnerPagination


class PartnerContentUpdateResponse(Content):
    job_id: str = ""


class PartnerContentStatusResponse(BaseModel):
    status: Literal["completed"]


class PartnerJobsResponse(BaseModel):
    jobs: dict[str, str]


class PartnerDeleteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    acknowledged: bool
    matched_count: int = Field(alias="matchedCount")
    modified_count: int = Field(alias="modifiedCount")
