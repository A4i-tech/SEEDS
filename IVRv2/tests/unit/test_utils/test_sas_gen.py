import pytest
import sys
import os
from unittest.mock import Mock, patch, MagicMock
import hashlib
import hmac
from datetime import datetime, timedelta

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from utils.sas_gen import SASGen


class TestSASGen:
    """Unit tests for SAS (Shared Access Signature) Generator utility class."""

    def setup_method(self):
        """Set up test data."""
        self.sas_gen = SASGen()
        self.test_url = "https://teststorage.blob.core.windows.net/test-container/test-blob.mp3"

    def test_sas_gen_initialization(self):
        """Test SAS generator initialization."""
        sas_gen = SASGen()
        assert sas_gen.credential is not None
        assert sas_gen.blob_service_client is None
        assert sas_gen.user_delegation_key is None

    @patch('utils.sas_gen.BlobServiceClient')
    def test_get_blob_service_client(self, mock_blob_service_client):
        """Test getting blob service client."""
        mock_client = MagicMock()
        mock_blob_service_client.return_value = mock_client
        
        client = self.sas_gen.get_blob_service_client(self.test_url)
        
        assert client == mock_client
        mock_blob_service_client.assert_called_once()

    @patch('utils.sas_gen.datetime')
    def test_get_user_delegation_key(self, mock_datetime):
        """Test getting user delegation key."""
        mock_now = datetime(2023, 1, 1, 12, 0, 0)
        mock_datetime.datetime.utcnow.return_value = mock_now
        
        mock_blob_service_client = MagicMock()
        mock_key = MagicMock()
        mock_blob_service_client.get_user_delegation_key.return_value = mock_key
        
        key = self.sas_gen.get_user_delegation_key(mock_blob_service_client)
        
        assert key == mock_key
        mock_blob_service_client.get_user_delegation_key.assert_called_once()

    @patch('utils.sas_gen.generate_blob_sas')
    @patch('utils.sas_gen.BlobServiceClient')
    def test_get_url_with_sas(self, mock_blob_service_client, mock_generate_sas):
        """Test generating URL with SAS token."""
        # Setup mocks
        mock_client = MagicMock()
        mock_client.account_name = "teststorage"
        mock_blob_service_client.return_value = mock_client
        
        mock_blob_client = MagicMock()
        mock_blob_client.url = "https://teststorage.blob.core.windows.net/test-container/test-blob.mp3"
        mock_client.get_blob_client.return_value = mock_blob_client
        
        mock_key = MagicMock()
        mock_client.get_user_delegation_key.return_value = mock_key
        
        mock_generate_sas.return_value = "sas_token_here"
        
        result = self.sas_gen.get_url_with_sas(self.test_url)
        
        expected_url = "https://teststorage.blob.core.windows.net/test-container/test-blob.mp3?sas_token_here"
        assert result == expected_url