"""Audit service — log CRUD."""

from __future__ import annotations

from typing import Any

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.audit_log import AuditLog
from app.platform.auth.dependencies import get_db
from app.repositories.audit_repository import AuditRepository


class AuditService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:
        self._repo = AuditRepository(db)

    async def create_log_entries(self, entries: list[AuditLog], tenant_id: str) -> None:
        for entry in entries:
            entry.tenant_id = tenant_id
            await self._repo.create_log(entry)

    async def find_logs_by_user(self, user_id: str, tenant_id: str) -> list[AuditLog]:
        return await self._repo.find_logs_by_user_and_tenant(user_id, tenant_id)


def get_audit_service(db: AsyncIOMotorDatabase[Any] = Depends(get_db)) -> AuditService:
    return AuditService(db)
