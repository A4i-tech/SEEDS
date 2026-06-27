"""Response DTO for school analytics response endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class AnalyticsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    startDate: str
    endDate: str
    count: int
    data: list[dict[str, Any]]
