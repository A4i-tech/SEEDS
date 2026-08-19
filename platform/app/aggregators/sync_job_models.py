"""Sync job domain model — typed DTOs for contentAggregatorSyncJobs."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SyncItemResult:
    source_id: str
    name: str
    status: str
    error: str | None
    at: str

    def to_doc(self) -> dict[str, object]:
        return {"source_id": self.source_id, "name": self.name, "status": self.status, "error": self.error, "at": self.at}

    @classmethod
    def from_doc(cls, doc: dict[str, object]) -> SyncItemResult:
        return cls(source_id=doc["source_id"], name=doc["name"], status=doc["status"], error=doc["error"], at=doc["at"])


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


@dataclass
class SyncJob:
    job_id: str
    tenant_id: str
    source_type: str
    scope: str
    source_id: str | None
    status: str
    started_at: str
    finished_at: str | None
    total_items: int
    processed: int
    stats: SyncStats
    items: list[SyncItemResult]
    error: str | None

    def to_doc(self) -> dict[str, object]:
        return {
            "_id": self.job_id, "tenant_id": self.tenant_id, "source_type": self.source_type, "scope": self.scope,
            "source_id": self.source_id, "status": self.status, "started_at": self.started_at,
            "finished_at": self.finished_at, "total_items": self.total_items, "processed": self.processed,
            "stats": self.stats.to_doc(), "items": [i.to_doc() for i in self.items], "error": self.error,
        }

    @classmethod
    def from_doc(cls, doc: dict[str, object]) -> SyncJob:
        return cls(
            job_id=doc["_id"], tenant_id=doc["tenant_id"], source_type=doc["source_type"], scope=doc["scope"],
            source_id=doc["source_id"], status=doc["status"], started_at=doc["started_at"], finished_at=doc["finished_at"],
            total_items=doc["total_items"], processed=doc["processed"], stats=SyncStats.from_doc(doc["stats"]),
            items=[SyncItemResult.from_doc(i) for i in doc["items"]], error=doc["error"],
        )
