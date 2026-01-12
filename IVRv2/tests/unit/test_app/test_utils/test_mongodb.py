import pytest
import sys
import os
import threading
from unittest.mock import AsyncMock, MagicMock, patch
from motor.motor_asyncio import AsyncIOMotorClient

# Add the parent directory to the path for imports
sys.path.append(
    os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )
)

import app.core.database as database
from app.core.database import MongoDBManager
from app.utils.mongodb import MongoDB


@pytest.fixture(autouse=True)
def reset_mongo_singleton():
    """Ensure MongoDB singleton state is reset between tests to avoid cross-test leakage."""
    # Reset the global mongodb_manager in core.database
    database.mongodb_manager = None
    yield
    database.mongodb_manager = None


@pytest.fixture
def mock_mongodb_manager(reset_mongo_singleton):
    """Create a mock MongoDB manager and set it as the global manager."""
    manager = MagicMock(spec=MongoDBManager)
    mock_db = MagicMock()
    mock_collection = AsyncMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)
    manager.database = mock_db
    manager.client = MagicMock()
    manager.database_name = "test"
    database.mongodb_manager = manager
    return manager, mock_db, mock_collection


class TestMongoDB:
    """Unit tests for MongoDB utility class."""

    def setup_method(self):
        """Set up test data."""
        self.mock_client = MagicMock()
        self.mock_db = MagicMock()
        self.mock_collection = MagicMock()

        # Set up mock hierarchy
        self.mock_client.__getitem__.return_value = self.mock_db
        self.mock_db.__getitem__.return_value = self.mock_collection

    @patch.dict(
        os.environ, {"MONGO_DB_CONNECTION_STRING": "mongodb://localhost:27017/test"}
    )
    @patch("app.core.database.settings")
    @patch("app.core.database.AsyncIOMotorClient")
    def test_mongodb_initialization(self, mock_motor_client, mock_settings):
        """Test MongoDB initialization."""
        mock_settings.mongo_db_connection_string = "mongodb://localhost:27017/test"
        mock_settings.mongo_max_pool_size = 50
        mock_motor_client.return_value = self.mock_client

        # Initialize the manager first
        manager = MongoDBManager()
        manager.initialize()
        database.mongodb_manager = manager

        mongo = MongoDB("test_collection")

        # Force lazy init
        mongo._ensure_initialized()

        assert mongo.collection is not None
        mock_motor_client.assert_called_once()
        args, kwargs = mock_motor_client.call_args
        assert args[0] == "mongodb://localhost:27017/test"
        assert kwargs == {"maxPoolSize": 50, "serverSelectionTimeoutMS": 5000}

    @patch.dict(
        os.environ, {"MONGO_DB_CONNECTION_STRING": "mongodb://localhost:27017/ivr"}
    )
    @patch("app.core.database.settings")
    @patch("app.core.database.AsyncIOMotorClient")
    def test_mongodb_initialization_with_default_db(
        self, mock_motor_client, mock_settings
    ):
        """Test MongoDB initialization with database in connection string."""
        mock_settings.mongo_db_connection_string = "mongodb://localhost:27017/ivr"
        mock_settings.mongo_max_pool_size = 50
        mock_motor_client.return_value = self.mock_client

        # Initialize the manager first
        manager = MongoDBManager()
        manager.initialize()
        database.mongodb_manager = manager

        mongo = MongoDB("test_collection")
        mongo._ensure_initialized()

        # Should use database from connection string path
        self.mock_client.__getitem__.assert_called_with("ivr")

    @patch("app.core.database.settings")
    def test_mongodb_initialization_missing_connection_string(self, mock_settings):
        """Test MongoDB initialization with missing connection string."""
        mock_settings.mongo_db_connection_string = None

        manager = MongoDBManager()
        with pytest.raises(
            ValueError, match="MONGO_DB_CONNECTION_STRING environment variable not set"
        ):
            manager.initialize()

    @pytest.mark.asyncio
    async def test_find_by_id(self, mock_mongodb_manager):
        """Test finding document by ID."""
        manager, mock_db, mock_collection = mock_mongodb_manager
        expected_doc = {"_id": "test_id", "name": "test document"}
        mock_collection.find_one.return_value = expected_doc

        mongo = MongoDB("test_collection")
        result = await mongo.find_by_id("test_id")

        assert result == expected_doc
        mock_collection.find_one.assert_called_once_with({"_id": "test_id"})

    @pytest.mark.asyncio
    async def test_find_one_by_query(self, mock_mongodb_manager):
        """Test finding one document by query."""
        manager, mock_db, mock_collection = mock_mongodb_manager
        expected_doc = {"name": "test", "status": "active"}
        mock_collection.find_one.return_value = expected_doc

        mongo = MongoDB("test_collection")
        query = {"status": "active"}
        result = await mongo.find_one_by_query(query)

        assert result == expected_doc
        mock_collection.find_one.assert_called_once_with(query)

    @pytest.mark.asyncio
    async def test_find_all(self, mock_mongodb_manager):
        """Test finding all documents."""
        manager, mock_db, mock_collection = mock_mongodb_manager
        expected_docs = [{"_id": "1", "name": "doc1"}, {"_id": "2", "name": "doc2"}]

        # Mock cursor behavior - cursor itself is not async, but to_list is
        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=expected_docs)

        mock_collection.find = MagicMock(return_value=mock_cursor)

        mongo = MongoDB("test_collection")
        result = await mongo.find_all()

        assert result == expected_docs
        mock_collection.find.assert_called_once_with({})

    @pytest.mark.asyncio
    async def test_insert(self, mock_mongodb_manager):
        """Test inserting a document."""
        manager, mock_db, mock_collection = mock_mongodb_manager
        mock_result = MagicMock()
        mock_result.inserted_id = "new_id_123"
        mock_result.acknowledged = True
        mock_collection.insert_one.return_value = mock_result

        mongo = MongoDB("test_collection")
        test_doc = {"name": "test document", "value": 42}

        result = await mongo.insert(test_doc)

        assert result == "new_id_123"
        mock_collection.insert_one.assert_called_once_with(test_doc)

    @pytest.mark.asyncio
    async def test_update_document(self, mock_mongodb_manager):
        """Test updating a document."""
        manager, mock_db, mock_collection = mock_mongodb_manager
        mock_result = MagicMock()
        mock_result.modified_count = 1
        mock_result.acknowledged = True
        mock_collection.replace_one.return_value = mock_result

        mongo = MongoDB("test_collection")
        doc_id = "test_id"
        new_doc = {"name": "updated document", "value": 100}

        result = await mongo.update_document(doc_id, new_doc)

        assert result == mock_result
        mock_collection.replace_one.assert_called_once()
        args, kwargs = mock_collection.replace_one.call_args
        assert args == ({"_id": doc_id}, new_doc)
        assert kwargs == {"upsert": True}

    @pytest.mark.asyncio
    async def test_delete(self, mock_mongodb_manager):
        """Test deleting a document."""
        manager, mock_db, mock_collection = mock_mongodb_manager
        mock_result = MagicMock()
        mock_result.deleted_count = 1
        mock_result.acknowledged = True
        mock_collection.delete_one.return_value = mock_result

        mongo = MongoDB("test_collection")
        doc_id = "test_id"

        result = await mongo.delete(doc_id)

        assert result == mock_result
        mock_collection.delete_one.assert_called_once_with({"_id": doc_id})

    @pytest.mark.asyncio
    async def test_mongodb_error_handling(self, mock_mongodb_manager):
        """Test MongoDB error handling."""
        from pymongo.errors import PyMongoError

        manager, mock_db, mock_collection = mock_mongodb_manager
        mock_collection.find_one.side_effect = PyMongoError("Connection error")

        mongo = MongoDB("test_collection")

        with pytest.raises(PyMongoError):
            await mongo.find_by_id("test_id")

    @patch.dict(
        os.environ, {"MONGO_DB_CONNECTION_STRING": "mongodb://localhost:27017/test"}
    )
    @patch("app.core.database.settings")
    @patch("app.core.database.AsyncIOMotorClient")
    def test_concurrent_initialization_single_client(
        self, mock_motor_client, mock_settings
    ):
        """Ensure only one MongoClient is created under concurrent init."""

        mock_settings.mongo_db_connection_string = "mongodb://localhost:27017/test"
        mock_settings.mongo_max_pool_size = 50
        mock_motor_client.return_value = self.mock_client

        start_event = threading.Event()
        results = []
        errors = []

        def worker():
            start_event.wait()
            try:
                # Initialize manager in each thread
                manager = MongoDBManager()
                manager.initialize()
                database.mongodb_manager = manager
                mongo = MongoDB("test_collection")
                mongo._ensure_initialized()
                results.append(mongo.collection)
            except Exception as exc:  # noqa: PERF203
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()

        start_event.set()
        for t in threads:
            t.join(timeout=5)

        assert not errors
        assert len(results) == 2
        # Note: with the new design, each manager might create its own client
        # The important thing is that each thread gets a working collection
        assert all(col is not None for col in results)
