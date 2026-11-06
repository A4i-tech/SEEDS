from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.requests.auth_requests import TeacherRegisterRequest


@pytest.mark.parametrize("role", ["textbook_remediation_volunteer", "tenant", "school_admin"])
def test_teacher_register_rejects_roles_outside_the_allow_list(role):
    with pytest.raises(ValidationError):
        TeacherRegisterRequest(
            phone_number="9999999999",
            password="P@ssw0rd!",
            name="Someone",
            role=role,
        )
