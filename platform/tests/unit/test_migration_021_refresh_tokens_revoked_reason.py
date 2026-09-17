from __future__ import annotations

import importlib.util
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import pytest

from tests.support.mongomock_async import AsyncMongoMockClient

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[2] / "migrations" / "021_refresh_tokens_revoked_reason.py"
)


def _load_migrate_fn():
    spec = importlib.util.spec_from_file_location("migration_021", _MIGRATION_PATH)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod.migrate


migrate = _load_migrate_fn()


@pytest.fixture
def mock_client():
    return AsyncMongoMockClient()


async def _seed(mock_client, docs):
    col = mock_client["seeds"]["userRefreshTokens"]
    for doc in docs:
        await col.insert_one(doc)
    return col


class TestMigration021Backfill:
    async def test_backfills_revoked_docs_missing_reason_as_consumed(self, mock_client):
        col = await _seed(
            mock_client,
            [
                {"token_id": "a", "revoked": True, "created_at": datetime.now(tz=UTC)},
                {"token_id": "b", "revoked": True, "created_at": datetime.now(tz=UTC)},
            ],
        )

        with patch("pymongo.AsyncMongoClient", return_value=mock_client):
            await migrate("mongodb://localhost:27017/seeds", dry_run=False)

        doc_a = await col.find_one({"token_id": "a"})
        doc_b = await col.find_one({"token_id": "b"})
        assert doc_a["revoked_reason"] == "consumed"
        assert doc_b["revoked_reason"] == "consumed"

    async def test_backfills_active_docs_missing_reason_as_none(self, mock_client):
        col = await _seed(
            mock_client,
            [{"token_id": "c", "revoked": False, "created_at": datetime.now(tz=UTC)}],
        )

        with patch("pymongo.AsyncMongoClient", return_value=mock_client):
            await migrate("mongodb://localhost:27017/seeds", dry_run=False)

        doc_c = await col.find_one({"token_id": "c"})
        assert doc_c["revoked_reason"] is None

    async def test_leaves_already_labeled_docs_untouched(self, mock_client):
        col = await _seed(
            mock_client,
            [
                {
                    "token_id": "d",
                    "revoked": True,
                    "revoked_reason": "logout",
                    "created_at": datetime.now(tz=UTC),
                }
            ],
        )

        with patch("pymongo.AsyncMongoClient", return_value=mock_client):
            await migrate("mongodb://localhost:27017/seeds", dry_run=False)

        doc_d = await col.find_one({"token_id": "d"})
        assert doc_d["revoked_reason"] == "logout"

    async def test_dry_run_does_not_write(self, mock_client):
        col = await _seed(
            mock_client,
            [{"token_id": "e", "revoked": True, "created_at": datetime.now(tz=UTC)}],
        )

        with patch("pymongo.AsyncMongoClient", return_value=mock_client):
            await migrate("mongodb://localhost:27017/seeds", dry_run=True)

        doc_e = await col.find_one({"token_id": "e"})
        assert "revoked_reason" not in doc_e

    async def test_idempotent_second_run_is_noop(self, mock_client):
        col = await _seed(
            mock_client,
            [{"token_id": "f", "revoked": True, "created_at": datetime.now(tz=UTC)}],
        )

        with patch("pymongo.AsyncMongoClient", return_value=mock_client):
            await migrate("mongodb://localhost:27017/seeds", dry_run=False)
            await migrate("mongodb://localhost:27017/seeds", dry_run=False)

        doc_f = await col.find_one({"token_id": "f"})
        assert doc_f["revoked_reason"] == "consumed"
