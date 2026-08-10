"""Response DTO for GET /tenant/dashboard."""

from __future__ import annotations

from pydantic import BaseModel


class DashboardStatistics(BaseModel):
    total_schools: int
    total_teachers: int
    total_students: int
    total_classes: int


class SchoolDashboardRow(BaseModel):
    """A school's row in the tenant dashboard's schools breakdown."""

    id: str | None = None
    tenant_id: str | None = None
    name: str
    email: str | None = None
    is_active: bool = True
    teacher_count: int
    student_count: int
    class_count: int


class TenantDashboardResponse(BaseModel):
    statistics: DashboardStatistics
    schools: list[SchoolDashboardRow]
