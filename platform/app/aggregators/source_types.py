"""Typed structures for multi-source sync orchestration.

Keeps the combined-sync controller free of ad-hoc dict/tuple plumbing: sources
are bound and collected through these DTOs, not (service, client) tuples.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)

SourceRecord = dict


@dataclass(frozen=True)
class CollectedUnits:
    """What a source plans to sync, before any writes — lets a combined run sum
    totals across sources and set job progress once."""

    session: str
    units: list[SourceRecord]
    total_available: int


class SourceService(Protocol):
    """Interface every aggregator service satisfies for combined sync."""

    async def get_course_diff(self, tenant_id: str, client: object) -> dict: ...

    async def collect_units(
        self, client: object, *, course_ids: list[str] | None = None, limit: int | None = None
    ) -> CollectedUnits: ...

    async def sync_units(
        self,
        tenant_id: str,
        client: object,
        job_repo: ContentAggregatorSyncJobRepository,
        job_id: str,
        session: str,
        units: list[SourceRecord],
        *,
        dry_run: bool = False,
    ) -> None: ...


@dataclass(frozen=True)
class SourceBinding:
    """A source's service instance paired with its provider client."""

    service: SourceService
    client: object


@dataclass(frozen=True)
class PlannedSource:
    """A bound source plus the units it collected, ready to process."""

    binding: SourceBinding
    session: str
    units: list[SourceRecord]
