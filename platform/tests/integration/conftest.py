from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["test_seeds"]
    await ContentAggregatorWebhookRepository.ensure_indexes(db)
    return db


@pytest.fixture
async def client(mock_db):
    app.dependency_overrides[get_db] = lambda: mock_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _tenant_headers(tenant_id: str) -> dict[str, str]:
    token = create_access_token({"sub": tenant_id, "role": "tenant", "tenant_id": tenant_id})
    return {"Authorization": f"Bearer {token}"}
