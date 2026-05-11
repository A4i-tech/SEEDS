"""Unit tests for MongoDBStorage using mocked get_mongodb_manager."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import sys
import os

os.environ["STORAGE_ACCOUNT_NAME"] = "test"
os.environ["ENVIRONMENT"] = "development"
os.environ["APPLICATIONINSIGHTS_CONNECTION_STRING"] = (
    "InstrumentationKey=test-key;IngestionEndpoint=https://test.com/"
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.storage_manager.mongodb_storage import MongoDBStorage


@pytest.fixture
def mock_collection():
    coll = AsyncMock()
    coll.replace_one = AsyncMock(return_value=MagicMock(acknowledged=True))
    coll.find_one = AsyncMock(return_value=None)
    return coll


@pytest.fixture
def mock_manager(mock_collection):
    mgr = MagicMock()
    mgr.get_collection.return_value = mock_collection
    return mgr


@pytest.mark.asyncio
async def test_mongodb_storage_save_state(mock_manager, mock_collection):
    with patch(
        "app.services.storage_manager.mongodb_storage.get_mongodb_manager",
        return_value=mock_manager,
    ):
        storage = MongoDBStorage()
        state = {"is_running": False, "teacher_phone_number": "+123"}
        await storage.save_state("conf-1", state)

    mock_collection.replace_one.assert_called_once()
    call_args = mock_collection.replace_one.call_args
    assert call_args[0][0] == {"_id": "conf-1"}
    doc = call_args[0][1]
    assert doc["_id"] == "conf-1"
    assert doc["is_running"] is False
    assert call_args[1]["upsert"] is True


@pytest.mark.asyncio
async def test_mongodb_storage_load_state_found(mock_manager, mock_collection):
    mock_collection.find_one.return_value = {"_id": "conf-1", "is_running": True}
    with patch(
        "app.services.storage_manager.mongodb_storage.get_mongodb_manager",
        return_value=mock_manager,
    ):
        storage = MongoDBStorage()
        out = await storage.load_state("conf-1")

    assert out == {"_id": "conf-1", "is_running": True}
    mock_collection.find_one.assert_called_once_with({"_id": "conf-1"})


@pytest.mark.asyncio
async def test_mongodb_storage_load_state_not_found(mock_manager, mock_collection):
    mock_collection.find_one.return_value = None
    with patch(
        "app.services.storage_manager.mongodb_storage.get_mongodb_manager",
        return_value=mock_manager,
    ):
        storage = MongoDBStorage()
        out = await storage.load_state("conf-missing")

    assert out is None


def test_mongodb_client_parses_db_from_connection_string():
    """DB name is parsed from connection string path (no MONGO_DB_NAME)."""
    from app.services.storage_manager.mongodb_client import MongoDBClientManager
    from unittest.mock import MagicMock, patch

    with patch("app.services.storage_manager.mongodb_client.AsyncIOMotorClient") as mock_client:
        mock_db = MagicMock()
        mock_coll = MagicMock()
        mock_client.return_value.__getitem__.return_value = mock_db
        mock_db.__getitem__.return_value = mock_coll

        mgr = MongoDBClientManager()
        mgr.initialize(
            connection_string="mongodb://localhost:27017/SEEDS-Teacher-Backend",
            collection_name="conference_state",
        )

        assert mgr._database_name == "SEEDS-Teacher-Backend"
        assert mgr._collection_name == "conference_state"
        mock_client.assert_called_once()
        mock_client.return_value.__getitem__.assert_called_once_with("SEEDS-Teacher-Backend")
        mock_db.__getitem__.assert_called_once_with("conference_state")


def test_mongodb_client_parses_db_from_srv_uri():
    """DB name parsed from mongodb+srv URI with query string."""
    from app.services.storage_manager.mongodb_client import MongoDBClientManager
    from unittest.mock import MagicMock, patch

    with patch("app.services.storage_manager.mongodb_client.AsyncIOMotorClient") as mock_client:
        mock_db = MagicMock()
        mock_coll = MagicMock()
        mock_client.return_value.__getitem__.return_value = mock_db
        mock_db.__getitem__.return_value = mock_coll

        mgr = MongoDBClientManager()
        mgr.initialize(
            connection_string="mongodb+srv://user:pass@host/SEEDS-Teacher-Backend?retryWrites=true&w=majority",
            collection_name="conference_state",
        )

        assert mgr._database_name == "SEEDS-Teacher-Backend"


def test_mongodb_client_raises_when_no_db_in_uri():
    """Raise when connection string has no database path."""
    from app.services.storage_manager.mongodb_client import MongoDBClientManager

    mgr = MongoDBClientManager()
    with pytest.raises(ValueError, match="Database name not found"):
        mgr.initialize(
            connection_string="mongodb://localhost:27017",
            collection_name="conference_state",
        )
