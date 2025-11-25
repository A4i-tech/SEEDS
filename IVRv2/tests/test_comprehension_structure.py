import pytest
import asyncio
from unittest.mock import patch
from app import comprehension_structure as cs

# Example document as returned from DB
EXAMPLE_DOC = {
    "__v": 0,
    "comprehension_id": "12345678",
    "id": "45",
    "isDeleted": "false",
    "isProcessed": "true",
    "isPullModel": "true",
    "isTeacherApp": "true",
    "language": "kannada",
    "localTitle": "ಮೊಲದ ಮರಿ",
    "negativeMarks": 0,
    "positiveMarks": 1,
    "questions": [
        {
            "correct_option_id": "3ef0ae75-9f9e-4d9a-8bfa-ac67297d15b0",
            "options": [
                {
                    "audio_path": "Quiz/Punyakoti/option_1/1/1.0.mp3",
                    "id": "3ef0ae75-9f9e-4d9a-8bfa-ac67297d15b0",
                    "text": " ತಾಯಿ",
                },
                {
                    "audio_path": "Quiz/Punyakoti/option_1/2/1.0.mp3",
                    "id": "614c161e-a0b0-426f-913c-fc8adba39f8b",
                    "text": " ಒಡಹುಟ್ಟಿದವರು",
                },
                {
                    "audio_path": "Quiz/Punyakoti/option_1/3/1.0.mp3",
                    "id": "f34e920d-78a5-4230-9bd0-d603acc941d5",
                    "text": " ಸ್ನೇಹಿತ",
                },
                {
                    "audio_path": "Quiz/Punyakoti/option_1/4/1.0.mp3",
                    "id": "e8ba0f72-bf17-47b2-ba4b-6bd53615604a",
                    "text": " ಚಿಕ್ಕಮ್ಮ ",
                },
            ],
            "question": {
                "audio_path": "Quiz/Punyakoti/question_1/1.0.mp3",
                "id": "f8210aca-d2e0-445e-bb92-9e673bb92158",
                "text": "ಪುಣ್ಯಕೋಟಿಗೂ ತನ್ನ ಕರುವಿಗೂ ಏನು ಸಂಬಂಧ? ",
            },
        }
    ],
    "theme": "water",
    "themeAudioPath": "Quiz/Punyakoti/themeAudio.mp3",
    "title": "Punyakoti",
    "titleAudioPath": "Quiz/Punyakoti/titleAudio.mp3",
    "type": "comprehension",
}


class DummyMongoDB:
    def __init__(self, collection):
        pass

    async def find_all(self):
        return EXAMPLE_DOC


@pytest.mark.asyncio
async def test_load_comprehension_structure_hydrates_audio(monkeypatch):
    # Patch MongoDB to use dummy
    monkeypatch.setattr(cs, "MongoDB", DummyMongoDB)

    # Patch settings to provide a fake storage account name
    class DummySettings:
        storage_account_name = "test_storage_account"

    monkeypatch.setattr(cs, "settings", DummySettings())

    hydrated = await cs.load_comprehension_structure()
    # Check top-level audio fields
    assert (
        hydrated["titleAudio"]
        == "https://test_storage_account.blob.core.windows.net/output-container/Quiz/Punyakoti/titleAudio.mp3"
    )
    assert (
        hydrated["themeAudio"]
        == "https://test_storage_account.blob.core.windows.net/output-container/Quiz/Punyakoti/themeAudio.mp3"
    )
    # Check question and option audio URLs
    q = hydrated["questions"][0]
    assert (
        q["question"]["url"]
        == "https://test_storage_account.blob.core.windows.net/output-container/Quiz/Punyakoti/question_1/1.0.mp3"
    )
    for opt in q["options"]:
        assert opt["url"].startswith(
            "https://test_storage_account.blob.core.windows.net/output-container/Quiz/Punyakoti/option_1/"
        )
