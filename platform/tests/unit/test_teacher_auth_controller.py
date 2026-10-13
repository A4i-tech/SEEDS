from __future__ import annotations

import pytest

from app.controllers.teacher_auth_controller import teacher_register
from app.models.requests.auth_requests import TeacherRegisterRequest
from app.platform.error_handling import ForbiddenError


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["textbook_remediation_volunteer", "tenant", "school_admin"])
async def test_teacher_register_rejects_roles_outside_the_allow_list(role):
    body = TeacherRegisterRequest(
        phone_number="9999999999", password="P@ssw0rd!", name="Someone",
        role=role,
    )
    with pytest.raises(ForbiddenError):
        await teacher_register(body, current_user={"tenant_id": "tenant-a", "school_id": None}, service=None)
