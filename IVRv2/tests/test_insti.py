import pytest
import asyncio
from app.fsm import insti
from unittest.mock import patch, MagicMock


class DummyMongoDBCollection:
    """Mock MongoDB collection for testing."""

    def __init__(self, collection_name: str = None):
        self.collection_name = collection_name

    async def find_all(self):
        # Return a document matching the provided contentv3.json structure and types
        return [
            {
                "_id": "0e02e8ed-9515-4c4b-80b1-d76fe5f3db41",
                "type": "story",
                "description": "Kannada Story",
                "language": "kannada",
                "title": {
                    "english": "Snehitaru",
                    "local": "ನಾನು ಮತ್ತು ನನ್ನ ಶರೀರ",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/experience-titles/20/1.0.mp3",
                },
                "theme": {
                    "english": "Our body and its functions",
                    "local": "ನಮ್ಮ ದೇಹ ಮತ್ತು ಅದರ ಕಾರ್ಯಗಳು",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/theme-titles/Our%20body%20and%20its%20functions/1.0.mp3",
                },
                "audioContent": [
                    {
                        "description": "some optional description of audio",
                        "audioUrl": "https://seedsblob.blob.core.windows.net/output-container/20/1.0.wav",
                    }
                ],
                "isPullModel": False,
                "isTeacherApp": True,
                "createdBy": "default_user_ID",
                "creation_time": 1668287376,
                "isDeleted": False,
            }
        ]

    async def query_items(self, query):
        return await self.find_all()


# Patch fsm.print_states and open to avoid side effects
def dummy_print_states(self):
    pass


insti.FSM.print_states = dummy_print_states


@pytest.mark.asyncio
async def test_instantiate_from_latest_content():
    class DummyFile:
        def write(self, _):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

    # Create mock collection
    mock_collection = DummyMongoDBCollection("contentsV3")

    with patch("builtins.open", return_value=DummyFile()):
        fsm = await insti.instantiate_from_latest_content(
            contents_v3_collection=mock_collection
        )
    assert fsm is not None
    assert hasattr(fsm, "states")
    assert isinstance(fsm.states, dict)
    # Check that END state exists
    assert "END" in fsm.states
    # Check that at least one state is generated
    assert len(fsm.states) > 1
