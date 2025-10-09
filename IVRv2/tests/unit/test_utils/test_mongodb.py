import pytest
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch
from pymongo.errors import PyMongoError

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from utils.mongodb import MongoDB


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

    @patch.dict(os.environ, {'MONGO_DB_CONNECTION_STRING': 'mongodb://localhost:27017'})
    @patch('utils.mongodb.MongoClient')
    def test_mongodb_initialization(self, mock_mongo_client):
        """Test MongoDB initialization."""
        mock_mongo_client.return_value = self.mock_client
        
        mongo = MongoDB("test_collection", "test_db")
        
        assert mongo.collection == self.mock_collection
        mock_mongo_client.assert_called_once_with("mongodb://localhost:27017")

    @patch.dict(os.environ, {'MONGO_DB_CONNECTION_STRING': 'mongodb://localhost:27017'})
    @patch('utils.mongodb.MongoClient')
    def test_mongodb_initialization_with_default_db(self, mock_mongo_client):
        """Test MongoDB initialization with default database."""
        mock_mongo_client.return_value = self.mock_client
        
        mongo = MongoDB("test_collection")
        
        # Should use default database "ivr"
        self.mock_client.__getitem__.assert_called_with("ivr")

    def test_mongodb_initialization_missing_connection_string(self):
        """Test MongoDB initialization with missing connection string."""
        # Clear the environment variable if it exists
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="MONGO_DB_CONNECTION_STRING environment variable not set"):
                MongoDB("test_collection")

    @patch.dict(os.environ, {'MONGO_DB_CONNECTION_STRING': 'mongodb://localhost:27017'})
    @patch('utils.mongodb.MongoClient')
    @pytest.mark.asyncio
    async def test_find_by_id(self, mock_mongo_client):
        """Test finding document by ID."""
        mock_mongo_client.return_value = self.mock_client
        expected_doc = {"_id": "test_id", "name": "test document"}
        self.mock_collection.find_one.return_value = expected_doc
        
        mongo = MongoDB("test_collection")
        result = await mongo.find_by_id("test_id")
        
        assert result == expected_doc
        self.mock_collection.find_one.assert_called_once_with({"_id": "test_id"})

    @patch.dict(os.environ, {'MONGO_DB_CONNECTION_STRING': 'mongodb://localhost:27017'})
    @patch('utils.mongodb.MongoClient')
    @pytest.mark.asyncio
    async def test_find_one_by_query(self, mock_mongo_client):
        """Test finding one document by query."""
        mock_mongo_client.return_value = self.mock_client
        expected_doc = {"name": "test", "status": "active"}
        self.mock_collection.find_one.return_value = expected_doc
        
        mongo = MongoDB("test_collection")
        query = {"status": "active"}
        result = await mongo.find_one_by_query(query)
        
        assert result == expected_doc
        self.mock_collection.find_one.assert_called_once_with(query)

    @patch.dict(os.environ, {'MONGO_DB_CONNECTION_STRING': 'mongodb://localhost:27017'})
    @patch('utils.mongodb.MongoClient')
    @pytest.mark.asyncio
    async def test_find_all(self, mock_mongo_client):
        """Test finding all documents."""
        mock_mongo_client.return_value = self.mock_client
        expected_docs = [
            {"_id": "1", "name": "doc1"},
            {"_id": "2", "name": "doc2"}
        ]
        
        # Mock cursor behavior
        mock_cursor = MagicMock()
        mock_cursor.__iter__ = MagicMock(return_value=iter(expected_docs))
        self.mock_collection.find.return_value = mock_cursor
        
        mongo = MongoDB("test_collection")
        result = await mongo.find_all()
        
        assert result == expected_docs
        self.mock_collection.find.assert_called_once_with()

    @patch.dict(os.environ, {'MONGO_DB_CONNECTION_STRING': 'mongodb://localhost:27017'})
    @patch('utils.mongodb.MongoClient')
    @pytest.mark.asyncio
    async def test_insert(self, mock_mongo_client):
        """Test inserting a document."""
        mock_mongo_client.return_value = self.mock_client
        mock_result = MagicMock()
        mock_result.inserted_id = "new_id_123"
        self.mock_collection.insert_one.return_value = mock_result
        
        mongo = MongoDB("test_collection")
        test_doc = {"name": "test document", "value": 42}
        
        result = await mongo.insert(test_doc)
        
        assert result == "new_id_123"
        self.mock_collection.insert_one.assert_called_once_with(test_doc)

    @patch.dict(os.environ, {'MONGO_DB_CONNECTION_STRING': 'mongodb://localhost:27017'})
    @patch('utils.mongodb.MongoClient')
    @pytest.mark.asyncio
    async def test_update_document(self, mock_mongo_client):
        """Test updating a document."""
        mock_mongo_client.return_value = self.mock_client
        mock_result = MagicMock()
        mock_result.modified_count = 1
        self.mock_collection.replace_one.return_value = mock_result
        
        mongo = MongoDB("test_collection")
        doc_id = "test_id"
        new_doc = {"name": "updated document", "value": 100}
        
        result = await mongo.update_document(doc_id, new_doc)
        
        assert result == mock_result
        self.mock_collection.replace_one.assert_called_once_with(
            {"_id": doc_id}, 
            new_doc, 
            upsert=True
        )

    @patch.dict(os.environ, {'MONGO_DB_CONNECTION_STRING': 'mongodb://localhost:27017'})
    @patch('utils.mongodb.MongoClient')
    @pytest.mark.asyncio
    async def test_delete(self, mock_mongo_client):
        """Test deleting a document."""
        mock_mongo_client.return_value = self.mock_client
        mock_result = MagicMock()
        mock_result.deleted_count = 1
        self.mock_collection.delete_one.return_value = mock_result
        
        mongo = MongoDB("test_collection")
        doc_id = "test_id"
        
        result = await mongo.delete(doc_id)
        
        assert result == mock_result
        self.mock_collection.delete_one.assert_called_once_with({"_id": doc_id})

    @patch.dict(os.environ, {'MONGO_DB_CONNECTION_STRING': 'mongodb://localhost:27017'})
    @patch('utils.mongodb.MongoClient')
    @pytest.mark.asyncio
    async def test_mongodb_error_handling(self, mock_mongo_client):
        """Test MongoDB error handling."""
        mock_mongo_client.return_value = self.mock_client
        self.mock_collection.find_one.side_effect = PyMongoError("Connection error")
        
        mongo = MongoDB("test_collection")
        
        with pytest.raises(PyMongoError):
            await mongo.find_by_id("test_id")