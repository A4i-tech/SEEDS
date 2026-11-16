from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.content import Content
from app.models.responses.content import PaginationInfo


class PartnerJobsResponse(BaseModel):
    jobs: dict[str, str]


class PartnerJobStatusResponse(BaseModel):
    job_id: str
    status: Literal["pending", "claimed", "running", "completed", "failed"]
    content_id: str
    created_at: datetime
    reason: str = ""


class PartnerContentPageResponse(BaseModel):
    data: list[Content]
    pagination: PaginationInfo


class PartnerContentUpdateResponse(Content):
    job_id: str = ""
