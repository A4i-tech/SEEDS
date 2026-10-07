"""Sync job domain model — typed DTOs for contentAggregatorSyncJobs."""
from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from enum import StrEnum

from app.aggregators.models import SourceType


class SyncScope(StrEnum):
    ALL = "all"
    COURSE = "course"


class SyncJobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class SyncItemStatus(StrEnum):
    SAVED = "saved"
    SKIPPED = "skipped"
    EMPTY = "empty"
    FAILED = "failed"


@dataclass(frozen=True)
class SyncOptions:
    only_new: bool = False
    dry_run: bool = False
    limit: int = 0

    def to_doc(self) -> dict[str, object]:
        return asdict(self)

    @classmethod
    def from_doc(cls, doc: dict[str, object]) -> SyncOptions:
        return cls(
            only_new=bool(doc.get("only_new")), dry_run=bool(doc.get("dry_run")), limit=doc.get("limit") or 0
        )


@dataclass(frozen=True)
class SyncItemResult:
    source_id: str
    name: str
    status: SyncItemStatus
    error: str
    at: str

    def to_doc(self) -> dict[str, object]:
        return {"source_id": self.source_id, "name": self.name, "status": self.status.value, "error": self.error, "at": self.at}

    @classmethod
    def from_doc(cls, doc: dict[str, object]) -> SyncItemResult:
        return cls(
            source_id=doc["source_id"], name=doc["name"], status=SyncItemStatus(doc["status"]),
            error=doc["error"] or "", at=doc["at"],
        )


@dataclass(frozen=True)
class SyncStats:
    saved: int = 0
    skipped: int = 0
    empty: int = 0
    failed: int = 0

    def to_doc(self) -> dict[str, int]:
        return {"saved": self.saved, "skipped": self.skipped, "empty": self.empty, "failed": self.failed}

    @classmethod
    def from_doc(cls, doc: dict[str, int]) -> SyncStats:
        return cls(saved=doc["saved"], skipped=doc["skipped"], empty=doc["empty"], failed=doc["failed"])

    @classmethod
    def from_items(cls, items: Iterable[SyncItemResult]) -> SyncStats:
        counts = Counter(i.status for i in items)
        return cls(
            saved=counts[SyncItemStatus.SAVED], skipped=counts[SyncItemStatus.SKIPPED],
            empty=counts[SyncItemStatus.EMPTY], failed=counts[SyncItemStatus.FAILED],
        )

    def total(self) -> int:
        return self.saved + self.skipped + self.empty + self.failed


@dataclass
class SyncJob:
    job_id: str
    tenant_id: str
    source_type: SourceType
    scope: SyncScope
    source_id: str
    status: SyncJobStatus
    created_at: str
    started_at: str
    finished_at: str
    total_items: int
    error: str
    options: SyncOptions
    retry_count: int = 0
    finished_total: int | None = None

    def to_doc(self) -> dict[str, object]:
        return {
            "_id": self.job_id, "tenant_id": self.tenant_id, "source_type": self.source_type.value,
            "scope": self.scope.value, "source_id": self.source_id, "status": self.status.value,
            "created_at": self.created_at,
            "started_at": self.started_at, "finished_at": self.finished_at,
            "total_items": self.total_items, "error": self.error, "options": self.options.to_doc(),
            "retry_count": self.retry_count, "finished_total": self.finished_total,
        }

    @classmethod
    def from_doc(cls, doc: dict[str, object]) -> SyncJob:
        return cls(
            job_id=doc["_id"], tenant_id=doc["tenant_id"], source_type=SourceType(doc["source_type"]),
            scope=SyncScope(doc["scope"]), source_id=doc["source_id"] or "", status=SyncJobStatus(doc["status"]),
            created_at=doc.get("created_at") or doc["started_at"], started_at=doc.get("started_at") or "",
            finished_at=doc["finished_at"] or "", total_items=doc["total_items"], error=doc["error"] or "",
            options=SyncOptions.from_doc(doc.get("options") or {}),
            retry_count=doc.get("retry_count", 0), finished_total=doc.get("finished_total"),
        )
