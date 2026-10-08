from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pymongo.errors import DuplicateKeyError

from app.repositories.user_refresh_token_repository import UserRefreshTokenRepository
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


async def test_ensure_indexes_is_idempotent(mock_db):
    await UserRefreshTokenRepository.ensure_indexes(mock_db)
    await UserRefreshTokenRepository.ensure_indexes(mock_db)

    info = await mock_db[UserRefreshTokenRepository.COLLECTION].index_information()
    assert "token_id_1" in info
    assert "owner_id_1" in info
    assert "expires_at_1" in info


async def test_token_id_index_is_unique(mock_db):
    await UserRefreshTokenRepository.ensure_indexes(mock_db)
    repo = UserRefreshTokenRepository(mock_db)
    now = datetime.now(tz=UTC)
    await repo.insert(
        token_id="raw-token",
        owner_id="user-1",
        claims={"role": "teacher", "tenant_id": "t1", "school_id": None},
        expires_at=now + timedelta(days=30),
        family_expires_at=now + timedelta(days=30),
        created_at=now,
    )

    with pytest.raises(DuplicateKeyError):
        await repo.insert(
            token_id="raw-token",
            owner_id="user-2",
            claims={"role": "teacher", "tenant_id": "t1", "school_id": None},
            expires_at=now + timedelta(days=30),
            family_expires_at=now + timedelta(days=30),
            created_at=now,
        )


async def test_expires_at_index_has_ttl(mock_db):
    await UserRefreshTokenRepository.ensure_indexes(mock_db)

    info = await mock_db[UserRefreshTokenRepository.COLLECTION].index_information()
    assert info["expires_at_1"]["expireAfterSeconds"] == 0
