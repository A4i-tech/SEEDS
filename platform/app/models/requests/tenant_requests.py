"""Request schemas for tenant analytics CRUD endpoints — snake_case only."""

from __future__ import annotations

from pydantic import BaseModel


class TenantAnalyticsRequest(BaseModel):
    startDate: str
    endDate: str
