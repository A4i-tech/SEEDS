from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from pymongo.errors import DuplicateKeyError

from app.platform.auth.refresh_tokens import (
    RefreshTokenPendingError,
    RefreshTokenReplayedError,
    RefreshTokenReusedError,
)
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


async def test_try_consume_concurrent_race_is_replayed_not_reused(mock_db):
    """A second try_consume racing just after the first must not be treated as theft."""
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
    new_pair = {
        "access_token": "new-access",
        "refresh_token": "new-token",
        "expires_in": 900,
        "token_type": "Bearer",
    }

    async def winner():
        consumed = await repo.try_consume("raw-token")
        await asyncio.sleep(0.02)
        await repo.cache_replay("raw-token", new_pair)
        return consumed

    async def loser():
        await asyncio.sleep(0.005)
        return await repo.try_consume("raw-token")

    winner_result, loser_result = await asyncio.gather(winner(), loser(), return_exceptions=True)

    assert not isinstance(winner_result, Exception)
    assert isinstance(loser_result, RefreshTokenReplayedError)
    assert loser_result.pair == new_pair


async def test_try_consume_reuse_after_grace_window_is_genuine_theft(mock_db):
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
    await repo.try_consume("raw-token")

    await mock_db[UserRefreshTokenRepository.COLLECTION].update_one(
        {"owner_id": "user-1"}, {"$set": {"consumed_at": now - timedelta(minutes=5)}}
    )

    with pytest.raises(RefreshTokenReusedError):
        await repo.try_consume("raw-token")


async def test_try_consume_without_replay_cache_entry_raises_pending(mock_db):
    """If the replay cache never gets populated, polling exhausts and the retry is pending."""
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
    await repo.try_consume("raw-token")

    with pytest.raises(RefreshTokenPendingError) as exc_info:
        await repo.try_consume("raw-token")

    assert exc_info.value.owner_id == "user-1"


async def test_cache_replay_stores_tokens_encrypted_at_rest(mock_db):
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
    pair = {
        "access_token": "plaintext-access",
        "refresh_token": "plaintext-refresh",
        "expires_in": 900,
        "token_type": "Bearer",
    }

    await repo.try_consume("raw-token")
    await repo.cache_replay("raw-token", pair)

    stored = await repo._replay_col.find_one({})
    assert stored is not None
    assert stored["pair"]["access_token"] != "plaintext-access"
    assert stored["pair"]["refresh_token"] != "plaintext-refresh"
    assert "plaintext-access" not in str(stored)
    assert "plaintext-refresh" not in str(stored)

    decrypted = UserRefreshTokenRepository._decrypt_pair(stored["pair"])
    assert decrypted == pair
