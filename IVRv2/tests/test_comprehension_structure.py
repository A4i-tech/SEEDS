import pytest

from app.comprehension_structure import (
    load_comprehension_structure,
    initialize_comprehension_structure,
)
from app.utils.audio import hydrate_comprehension_document, build_audio_url
from app.repositories.comprehension_repository import ComprehensionRepository
from tests.fixtures.comprehension_data import (
    SAMPLE_COMPREHENSION_DOC,
    MINIMAL_COMPREHENSION_DOC,
)
from tests.mocks.mock_database import MockDatabase


# ==================== Fixtures ====================


@pytest.fixture
def mock_audio_settings(monkeypatch):
    """Fixture to mock audio storage settings for all tests"""
    import app.utils.audio as audio_module

    monkeypatch.setattr(
        audio_module,
        "STORAGE_ACCOUNT_BASE_URL",
        "https://teststorage.blob.core.windows.net/",
    )
    monkeypatch.setattr(audio_module, "OUTPUT_CONTAINER_PATH", "output-container/")
    return audio_module


@pytest.fixture
def mock_repo_with_data():
    """Fixture providing repository with sample comprehension data"""
    mock_db = MockDatabase([SAMPLE_COMPREHENSION_DOC.copy()])
    return ComprehensionRepository(mock_db)


@pytest.fixture
def empty_mock_repo():
    """Fixture providing repository with empty database"""
    mock_db = MockDatabase([])
    return ComprehensionRepository(mock_db)


# ==================== Test Audio URL Building ====================


def test_build_audio_url(mock_audio_settings):
    """Test that audio URLs are built correctly"""
    url = build_audio_url("Quiz/Punyakoti/titleAudio.mp3")
    assert (
        url
        == "https://teststorage.blob.core.windows.net/output-container/Quiz/Punyakoti/titleAudio.mp3"
    )


def test_build_audio_url_with_special_characters(mock_audio_settings):
    """Test audio URL building with special characters in path"""
    url = build_audio_url("Quiz/Test Question/audio file.mp3")
    assert (
        url
        == "https://teststorage.blob.core.windows.net/output-container/Quiz/Test Question/audio file.mp3"
    )


# ==================== Test Document Hydration ====================


def test_hydrate_comprehension_document_title_and_theme(mock_audio_settings):
    """Test that title and theme audio paths are hydrated"""
    docs = [MINIMAL_COMPREHENSION_DOC.copy()]
    hydrated = hydrate_comprehension_document(docs)

    assert len(hydrated) == 1
    doc = hydrated[0]
    assert "titleAudio" in doc
    assert "themeAudio" in doc
    assert doc["titleAudio"].endswith("test/title.mp3")
    assert doc["themeAudio"].endswith("test/theme.mp3")
    assert "titleAudioPath" in doc  # Original paths should remain


def test_hydrate_comprehension_document_questions_and_options(mock_audio_settings):
    """Test that question and option audio paths are hydrated"""
    docs = [MINIMAL_COMPREHENSION_DOC.copy()]
    hydrated = hydrate_comprehension_document(docs)

    question = hydrated[0]["questions"][0]
    assert "url" in question["question"]
    assert question["question"]["url"].endswith("test/question.mp3")
    assert all("url" in opt for opt in question["options"])
    assert question["options"][0]["url"].endswith("test/option1.mp3")
    assert question["options"][1]["url"].endswith("test/option2.mp3")


def test_hydrate_comprehension_document_full_structure(mock_audio_settings):
    """Test hydration of complete comprehension structure with multiple questions"""
    docs = [SAMPLE_COMPREHENSION_DOC.copy()]
    hydrated = hydrate_comprehension_document(docs)

    assert len(hydrated) == 1
    doc = hydrated[0]

    # Check top-level audio
    assert "titleAudio" in doc
    assert "themeAudio" in doc
    assert doc["titleAudio"].endswith("Quiz/Punyakoti/titleAudio.mp3")
    assert doc["themeAudio"].endswith("Quiz/Punyakoti/themeAudio.mp3")

    # Check all questions have URLs
    assert len(doc["questions"]) >= 2
    for question in doc["questions"]:
        assert "url" in question["question"]
        assert question["question"]["url"].startswith(
            "https://teststorage.blob.core.windows.net/"
        )

        # Check all options have URLs
        for option in question["options"]:
            assert "url" in option
            assert option["url"].startswith(
                "https://teststorage.blob.core.windows.net/"
            )


def test_hydrate_comprehension_document_missing_audio_paths(mock_audio_settings):
    """Test hydration when some audio paths are missing"""
    docs = [
        {
            "titleAudioPath": "test/title.mp3",
            "questions": [
                {
                    "question": {"id": "q1", "text": "Test question?"},
                    "options": [
                        {
                            "id": "opt1",
                            "text": "Option 1",
                            "audio_path": "test/opt1.mp3",
                        }
                    ],
                }
            ],
        }
    ]

    hydrated = hydrate_comprehension_document(docs)
    doc = hydrated[0]

    # Should have titleAudio but not themeAudio
    assert "titleAudio" in doc
    assert "themeAudio" not in doc

    # Question should not have URL, but option should
    assert "url" not in doc["questions"][0]["question"]
    assert "url" in doc["questions"][0]["options"][0]


# ==================== Test Repository Integration ====================


@pytest.mark.asyncio
async def test_load_comprehension_structure_with_mock_repository(mock_repo_with_data):
    """Test loading comprehension structure with injected mock repository"""
    result = await load_comprehension_structure(repository=mock_repo_with_data)

    assert isinstance(result, list)
    assert len(result) > 0


@pytest.mark.asyncio
async def test_load_comprehension_structure_hydrates_all_audio(mock_repo_with_data):
    """Test that load_comprehension_structure properly hydrates all audio URLs"""
    result = await load_comprehension_structure(repository=mock_repo_with_data)

    assert isinstance(result, list)
    assert len(result) > 0

    doc = result[0]
    assert "titleAudio" in doc
    assert "themeAudio" in doc
    assert all("url" in q["question"] for q in doc["questions"])


@pytest.mark.asyncio
async def test_load_comprehension_structure_with_empty_database(empty_mock_repo):
    """Test error handling when database is empty"""
    result = await load_comprehension_structure(repository=empty_mock_repo)
    assert result is not None


@pytest.mark.asyncio
async def test_initialize_comprehension_structure(mock_repo_with_data):
    """Test initialization of global comprehension structure"""
    await initialize_comprehension_structure(repository=mock_repo_with_data)

    from app import comprehension_structure as cs_module

    assert cs_module.comprehension_structure is not None


# ==================== Test Dependency Injection ====================


@pytest.mark.asyncio
async def test_dependency_injection_allows_mock_database(mock_repo_with_data):
    """Test that dependency injection allows us to use mock database for testing"""
    result = await load_comprehension_structure(repository=mock_repo_with_data)

    assert result is not None
    assert isinstance(result, (dict, list))


@pytest.mark.asyncio
async def test_multiple_comprehensions_in_database():
    """Test handling multiple comprehension documents"""
    doc1 = SAMPLE_COMPREHENSION_DOC.copy()
    doc1["_id"] = "doc1"
    doc1["title"] = "Comprehension 1"

    doc2 = SAMPLE_COMPREHENSION_DOC.copy()
    doc2["_id"] = "doc2"
    doc2["title"] = "Comprehension 2"

    mock_db = MockDatabase([doc1, doc2])
    mock_repo = ComprehensionRepository(mock_db)

    result = await load_comprehension_structure(repository=mock_repo)
    assert result is not None


# ==================== Test Data Integrity ====================


def test_comprehension_document_structure():
    """Test that the example document has expected structure"""
    doc = SAMPLE_COMPREHENSION_DOC

    # Verify required fields
    required_fields = [
        "comprehension_id",
        "title",
        "questions",
        "titleAudioPath",
        "themeAudioPath",
    ]
    assert all(field in doc for field in required_fields)

    # Verify questions structure
    assert len(doc["questions"]) > 0
    for question in doc["questions"]:
        # Verify question has required fields
        assert all(
            field in question for field in ["question", "options", "correct_option_id"]
        )

        # Verify question structure
        assert all(
            field in question["question"] for field in ["id", "text", "audio_path"]
        )

        # Verify options structure
        assert len(question["options"]) > 0
        for option in question["options"]:
            assert all(field in option for field in ["id", "text", "audio_path"])


@pytest.mark.asyncio
async def test_repository_find_by_id(mock_repo_with_data):
    """Test repository can find comprehension by ID"""
    result = await mock_repo_with_data.get_comprehension_by_id(
        "692564322dabc989a8c86d72"
    )

    assert result is not None
    assert result["comprehension_id"] == "12345678"


@pytest.mark.asyncio
async def test_repository_get_all():
    """Test repository can get all comprehensions"""
    doc1 = SAMPLE_COMPREHENSION_DOC.copy()
    doc2 = SAMPLE_COMPREHENSION_DOC.copy()
    doc2["_id"] = "different_id"

    mock_db = MockDatabase([doc1, doc2])
    repo = ComprehensionRepository(mock_db)

    result = await repo.get_all_comprehensions()
    assert len(result) == 2
