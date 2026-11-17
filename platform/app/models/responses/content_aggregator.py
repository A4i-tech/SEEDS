from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.content import Content
from app.models.responses.content import PaginationInfo, QuizContent


class PartnerJobsResponse(BaseModel):
    jobs: dict[str, str]


class PartnerJobStatusResponse(BaseModel):
    job_id: str
    status: Literal["pending", "claimed", "running", "completed", "failed", "cancelled"]
    content_id: str
    created_at: datetime
    reason: str = ""


class PartnerDeleteResponse(BaseModel):
    acknowledged: bool
    matched_count: int
    modified_count: int


class PartnerContentPageResponse(BaseModel):
    data: list[Content] | list[QuizContent]
    pagination: PaginationInfo


class PartnerContentUpdateResponse(Content):
    job_id: str = ""
