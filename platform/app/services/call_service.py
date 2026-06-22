"""Call service — business logic for call log and FSM context operations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.repositories.call_repository import CallRepository


class CallService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:
        self._repo = CallRepository(db)

    async def log_call(self, body: dict[str, Any]) -> dict[str, Any]:
        return await self._repo.insert_raw_log({**body, "created_at": datetime.now(timezone.utc)})

    async def get_call_log(self, call_id: str) -> dict[str, Any]:
        doc = await self._repo.find_raw_log_by_id(call_id)
        if not doc:
            raise NotFoundError("CallLog", call_id)
        return doc

    async def save_fsm_context(self, body: dict[str, Any]) -> dict[str, Any]:
        return await self._repo.insert_fsm_context(
            {**body, "created_at": datetime.now(timezone.utc)}
        )

    async def get_fsm_context(self, context_id: str) -> dict[str, Any]:
        doc = await self._repo.find_fsm_context_by_id(context_id)
        if not doc:
            raise NotFoundError("FsmContext", context_id)
        return doc


def get_call_service(db: AsyncIOMotorDatabase[Any] = Depends(get_db)) -> CallService:
    return CallService(db)
