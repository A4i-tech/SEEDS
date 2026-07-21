"""Response DTOs for analytics endpoints.

The IVR/conference models mirror the camelCase contract consumed by
ContentWebApp exactly. They are used as FastAPI ``response_model`` so the shape
is validated on the way out and published to OpenAPI, rather than the routes
returning a bare ``dict``.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class AnalyticsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    start_date: str
    end_date: str
    count: int
    data: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------


class AnalyticsFilters(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    schoolId: str | None = None
    teacherId: str | None = None


# ---------------------------------------------------------------------------
# IVR analytics
# ---------------------------------------------------------------------------


class IvrTotals(BaseModel):
    totalCalls: int
    completedCalls: int
    failedCalls: int
    droppedCalls: int
    dropFailureRate: float | None = None
    unattributedCalls: int


class SessionLength(BaseModel):
    averageSeconds: float | None = None
    medianSeconds: float | None = None
    totalSeconds: float | None = None


class IvrSchoolRow(BaseModel):
    schoolId: str
    schoolName: str | None = None
    totalCalls: int
    averageSeconds: float | None = None
    medianSeconds: float | None = None
    failureRate: float | None = None


class IvrTeacherRow(BaseModel):
    teacherId: str | None = None
    teacherName: str | None = None
    schoolId: str | None = None
    schoolName: str | None = None
    totalCalls: int
    averageSeconds: float | None = None
    failureRate: float | None = None


class ContentUsageRow(BaseModel):
    contentId: str | None = None
    title: str | None = None
    streamUrl: str
    playCount: int
    completedPlays: int
    uniqueCallers: int


class IvrCallRow(BaseModel):
    phoneNumber: str | None = None
    callerName: str | None = None
    callerType: str | None = None
    schoolName: str | None = None
    createdAt: Any | None = None
    stoppedAt: Any | None = None
    durationSeconds: float | None = None
    finalStatus: str | None = None


class IvrAnalyticsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    startDate: str
    endDate: str
    filters: AnalyticsFilters
    totals: IvrTotals
    sessionLength: SessionLength
    statusBreakdown: dict[str, int]
    bySchool: list[IvrSchoolRow]
    byTeacher: list[IvrTeacherRow]
    contentUsage: list[ContentUsageRow]
    calls: list[IvrCallRow]
    callsTruncated: bool = False


# ---------------------------------------------------------------------------
# Conference analytics
# ---------------------------------------------------------------------------


class ConferenceTotals(BaseModel):
    totalConferences: int
    completedConferences: int
    liveConferences: int
    neverStarted: int


class ConferenceDuration(BaseModel):
    averageSeconds: float | None = None
    medianSeconds: float | None = None
    totalSeconds: float | None = None


class ClassSizeBucket(BaseModel):
    bucket: str
    count: int


class ClassSize(BaseModel):
    average: float | None = None
    median: float | None = None
    distribution: list[ClassSizeBucket]


class RaisedHands(BaseModel):
    totalEvents: int
    averagePerConference: float | None = None


class ConferenceTeacherRow(BaseModel):
    teacherId: str | None = None
    teacherName: str | None = None
    schoolId: str | None = None
    schoolName: str | None = None
    totalConferences: int
    totalDurationSeconds: float | None = None
    averageDurationSeconds: float | None = None
    averageClassSize: float | None = None
    raisedHandEvents: int


class ConferenceRow(BaseModel):
    conferenceId: Any | None = None
    teacherName: str | None = None
    schoolName: str | None = None
    startedAt: str | None = None
    endedAt: str | None = None
    durationSeconds: float | None = None
    studentCount: int
    raisedHandEvents: int
    isRunning: bool


class ConferenceAnalyticsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    startDate: str
    endDate: str
    filters: AnalyticsFilters
    totals: ConferenceTotals
    duration: ConferenceDuration
    classSize: ClassSize
    raisedHands: RaisedHands
    byTeacher: list[ConferenceTeacherRow]
    conferences: list[ConferenceRow]
    conferencesTruncated: bool = False
