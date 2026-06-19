import pytest

from app.utils.pause_announcement import (
    get_pause_instruction,
    get_paused_announcement,
    get_resuming_announcement,
    PAUSE_INSTRUCTIONS,
    PAUSED_ANNOUNCEMENTS,
    RESUMING_ANNOUNCEMENTS,
)

LANGUAGES = ["kn", "en", "hi", "bn", "ta", "mr"]


class TestGetPauseInstruction:
    @pytest.mark.parametrize("lang", LANGUAGES)
    def test_returns_correct_text_for_language(self, lang):
        assert get_pause_instruction(lang) == PAUSE_INSTRUCTIONS[lang]

    def test_unknown_language_falls_back_to_english(self):
        assert get_pause_instruction("swahili") == PAUSE_INSTRUCTIONS["en"]

    def test_empty_string_falls_back_to_english(self):
        assert get_pause_instruction("") == PAUSE_INSTRUCTIONS["en"]

    def test_each_language_has_distinct_text(self):
        results = [get_pause_instruction(lang) for lang in LANGUAGES]
        assert len(set(results)) == len(LANGUAGES)


class TestGetPausedAnnouncement:
    @pytest.mark.parametrize("lang", LANGUAGES)
    def test_returns_correct_text_for_language(self, lang):
        assert get_paused_announcement(lang) == PAUSED_ANNOUNCEMENTS[lang]

    def test_unknown_language_falls_back_to_english(self):
        assert get_paused_announcement("swahili") == PAUSED_ANNOUNCEMENTS["en"]

    def test_empty_string_falls_back_to_english(self):
        assert get_paused_announcement("") == PAUSED_ANNOUNCEMENTS["en"]


class TestGetResumingAnnouncement:
    @pytest.mark.parametrize("lang", LANGUAGES)
    def test_returns_correct_text_for_language(self, lang):
        assert get_resuming_announcement(lang) == RESUMING_ANNOUNCEMENTS[lang]

    def test_unknown_language_falls_back_to_english(self):
        assert get_resuming_announcement("swahili") == RESUMING_ANNOUNCEMENTS["en"]

    def test_empty_string_falls_back_to_english(self):
        assert get_resuming_announcement("") == RESUMING_ANNOUNCEMENTS["en"]
