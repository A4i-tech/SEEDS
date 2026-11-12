from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.content import Content


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
    updated_fields: list[str] = Field(default_factory=list)


class PartnerContentStatusResponse(BaseModel):
    status: Literal["pending", "processing", "completed", "failed"]
    attempted_at: datetime | None = None
    completed_at: datetime | None = None
    failed_at: datetime | None = None
    error: str | None = None


class PartnerJobsResponse(BaseModel):
    jobs: dict[str, str]


class PartnerDeleteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    acknowledged: bool
    matched_count: int = Field(alias="matchedCount")
    modified_count: int = Field(alias="modifiedCount")
