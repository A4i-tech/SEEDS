import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import numpy as np
from app.services.audio.hold_detector import HoldDetector
from app.services.audio.transcriber import AudioTranscriber

@pytest.mark.asyncio
async def test_hold_detector_initialization():
    """Test that HoldDetector initializes and loads embeddings."""
    mock_client = AsyncMock()
     # Mock embedding response
    mock_response = MagicMock()
    mock_embedding_obj = MagicMock()
    mock_embedding_obj.embedding = [0.1, 0.2, 0.3]
    mock_response.data = [mock_embedding_obj] * 9 # For 9 hold phrases
    mock_client.embeddings.create.return_value = mock_response

    with patch("app.services.audio.hold_detector.AsyncOpenAI", return_value=mock_client):
        detector = await HoldDetector.create()
        
        assert detector.client is not None
        assert len(detector.hold_embeddings) == 9
        mock_client.embeddings.create.assert_called_once()
        args, kwargs = mock_client.embeddings.create.call_args
        assert kwargs["model"] == "text-embedding-3-small"

@pytest.mark.asyncio
async def test_hold_detector_detect_hold():
    """Test detection logic with mocked embeddings."""
    mock_client = AsyncMock()
    
    # helper to mock embedding return
    async def mock_create_embedding(input, model):
        mock_resp = MagicMock()
        # If input is list of phrases (init)
        if isinstance(input, list) and len(input) > 1:
            # Return "hold" vector
            emb = MagicMock()
            emb.embedding = [1.0, 0.0, 0.0] 
            mock_resp.data = [emb] * len(input)
        else:
             # Input is single text
             emb = MagicMock()
             emb.embedding = [0.99, 0.05, 0.0] # Very similar to [1,0,0]
             mock_resp.data = [emb]
        return mock_resp

    mock_client.embeddings.create.side_effect = mock_create_embedding

    with patch("app.services.audio.hold_detector.AsyncOpenAI", return_value=mock_client):
        detector = await HoldDetector.create()
        
        # Detect
        result = await detector.detect("Please hold on")
        
        assert result["is_hold"] is True
        assert result["score"] > 0.82

@pytest.mark.asyncio
async def test_transcriber_buffer():
    """Test AudioTranscriber buffering logic."""
    with patch("app.services.audio.transcriber.AsyncOpenAI"):
        transcriber = AudioTranscriber()
        transcriber.INPUT_RATE = 100
        transcriber.BUFFER_DURATION_SEC = 1
        transcriber.buffer_limit_bytes = 200 # 100 * 2 * 1
        
        # Send small chunk
        chunk = b'\x00' * 100
        res = await transcriber.process_chunk(chunk)
        assert res is None
        assert len(transcriber.buffer) == 100
        
        # Send remaining chunk to trigger process
        # We need to mock _transcribe to avoid actual processing/API calls in this unit test
        # But _transcribe is what we might want to test. 
        # Let's mock _transcribe for this specific test to verify logic flow
        transcriber._transcribe = AsyncMock(return_value={"text": "test"})
        
        res = await transcriber.process_chunk(chunk)
        assert res == {"text": "test"}
