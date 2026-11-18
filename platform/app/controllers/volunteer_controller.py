from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, status

from app.models.requests.auth_requests import VolunteerCreateRequest
from app.models.responses.user import UserPublicResponse
from app.platform.auth.dependencies import require_tenant
from app.services.volunteer_service import VolunteerService, get_volunteer_service

router = APIRouter(prefix="/tenant", tags=["Auth"])


@router.post(
    "/volunteers",
    summary="Create a textbook remediation volunteer for this tenant",
    description=(
        "Request carries email plus password. Response id is the stable user identifier "
        "(token sub) used for assignment and attribution. Duplicate email returns 409."
    ),
    status_code=status.HTTP_201_CREATED,
    response_model_exclude_none=True,
    responses={409: {"description": "Email already taken"}},
)
async def create_volunteer(
    body: VolunteerCreateRequest,
    current_user: dict[str, Any] = Depends(require_tenant),
    service: VolunteerService = Depends(get_volunteer_service),
) -> UserPublicResponse:
    user = await service.register_volunteer(current_user["sub"], body)
    return UserPublicResponse.from_domain(user)


@router.get("/volunteers", summary="List textbook remediation volunteers for this tenant")
async def list_volunteers(
    current_user: dict[str, Any] = Depends(require_tenant),
    service: VolunteerService = Depends(get_volunteer_service),
) -> list[UserPublicResponse]:
    users = await service.list_volunteers(current_user["sub"])
    return [UserPublicResponse.from_domain(u) for u in users]
