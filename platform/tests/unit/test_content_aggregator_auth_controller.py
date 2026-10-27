from __future__ import annotations

import pytest

from app.controllers.content_aggregator_auth_controller import register_client
from app.models.requests.content_aggregator_requests import ContentAggregatorRegisterRequest
from app.platform.error_handling import ForbiddenError
from app.platform.settings import Settings
from app.services.content_aggregator.auth import ContentAggregatorAuth
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def auth() -> ContentAggregatorAuth:
    client = AsyncMongoMockClient()
    return ContentAggregatorAuth(
        client["test_seeds"], Settings(secret_key="test-secret-key-for-tests-32chars!!")
    )


@pytest.mark.asyncio
async def test_register_client_rejects_foreign_tenant_ids(auth):
    body = ContentAggregatorRegisterRequest(
        name="Partner", tenant_ids=["tenant-b"], scopes=["content:read"]
    )
    with pytest.raises(ForbiddenError):
        await register_client(body, auth=auth, current_user={"sub": "tenant-a", "role": "tenant"})


@pytest.mark.asyncio
async def test_register_client_allows_own_tenant_id(auth):
    body = ContentAggregatorRegisterRequest(
        name="Partner", tenant_ids=["tenant-a"], scopes=["content:read"]
    )
    result = await register_client(
        body, auth=auth, current_user={"sub": "tenant-a", "role": "tenant"}
    )
    assert result.tenant_ids == ["tenant-a"]
