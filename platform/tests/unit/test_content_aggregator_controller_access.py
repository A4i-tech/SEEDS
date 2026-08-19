from __future__ import annotations

import pytest

from app.controllers.content_aggregator_controller import (
    _require_aggregator_access,
    _require_tenant,
)
from app.platform.error_handling import ForbiddenError


@pytest.mark.asyncio
async def test_require_tenant_blocks_school_admin_and_content_creator():
    for role in ("school_admin", "content_creator", "teacher"):
        with pytest.raises(ForbiddenError):
            await _require_tenant(user={"role": role})


@pytest.mark.asyncio
async def test_require_aggregator_access_allows_tenant_school_admin_content_creator():
    for role in ("tenant", "school_admin", "content_creator"):
        user = {"role": role}
        assert await _require_aggregator_access(user=user) == user


@pytest.mark.asyncio
async def test_require_aggregator_access_blocks_teacher():
    with pytest.raises(ForbiddenError):
        await _require_aggregator_access(user={"role": "teacher"})
