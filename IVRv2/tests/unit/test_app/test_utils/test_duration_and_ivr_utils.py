import pytest

from app.utils.duration_announcement import format_duration_announcement
from app.utils.ivr_utils import get_vonage_language_code

LANGUAGES = ["kannada", "english", "hindi", "bengali", "tamil", "marathi"]


class TestFormatDurationAnnouncement:

    @pytest.mark.parametrize("invalid", [None, 0, -30])
    def test_invalid_input_returns_empty_string(self, invalid):
        assert format_duration_announcement(invalid, "english") == ""

    @pytest.mark.parametrize("seconds, expected", [
        (270, "This content is 4 minutes 30 seconds long"),  # full
        (120, "This content is 2 minutes long"),             # minutes only
        (45,  "This content is 45 seconds long"),            # seconds only
    ])
    def test_english_exact_output(self, seconds, expected):
        assert format_duration_announcement(seconds, "english") == expected

    @pytest.mark.parametrize("lang", LANGUAGES)
    @pytest.mark.parametrize("seconds", [90, 60, 45])  # full, minutes-only, seconds-only
    def test_all_languages_return_non_empty(self, seconds, lang):
        assert len(format_duration_announcement(seconds, lang)) > 0

    @pytest.mark.parametrize("seconds", [90, 60, 45])
    def test_unknown_language_falls_back_to_english(self, seconds):
        assert format_duration_announcement(seconds, "swahili") == \
               format_duration_announcement(seconds, "english")


class TestGetVonageLanguageCode:

    @pytest.mark.parametrize("lang, expected", [
        ("kn", "kn-IN"),
        ("en", "en-US"),
        ("hi", "hi-IN"),
        ("bn", "bn-IN"),
        ("ta", "ta-IN"),
        ("mr", "mr-IN"),
        ("swahili", "en-US"),   # unknown → fallback
        ("",        "en-US"),   # empty → fallback
    ])
    def test_language_to_vonage_code(self, lang, expected):
        assert get_vonage_language_code(lang) == expected
