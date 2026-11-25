from __future__ import annotations

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.auth_requests import VolunteerCreateRequest
from app.models.user import User, UserCreate, UserRole
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.error_handling import ConflictError
from app.repositories.user_repository import UserRepository


class VolunteerService:
    def __init__(self, db: AsyncDatabase) -> None:
        self._users = UserRepository(db)

    async def register_volunteer(self, tenant_id: str, body: VolunteerCreateRequest) -> User:
        existing = await self._users.find_by_email(body.email)

        if existing is not None:
            raise ConflictError(f"email {body.email}")

        return await self._users.create(
            UserCreate(
                role=UserRole.TEXTBOOK_REMEDIATION_VOLUNTEER,
                name=body.name,
                email=body.email,
                hashed_password=await hash_password(body.password),
                tenant_id=tenant_id,
            )
        )

    async def list_volunteers(self, tenant_id: str) -> list[User]:
        return await self._users.find_all_by_tenant_and_role(tenant_id, UserRole.TEXTBOOK_REMEDIATION_VOLUNTEER.value)


def get_volunteer_service(db: AsyncDatabase = Depends(get_db)) -> VolunteerService:
    return VolunteerService(db)
