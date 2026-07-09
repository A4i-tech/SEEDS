"""IVR FSM constants — audio URL templates and navigation keys.

Ported from IVRv2/app/fsm/ivr_constants.py.
Storage account URLs are computed lazily from settings.
"""

from __future__ import annotations

from functools import lru_cache

from app.platform.settings import get_settings


@lru_cache(maxsize=1)
def _get_base_urls() -> tuple[str, str]:
    """Return (storage_account_base_url, pullMenuMainUrl) from settings."""

    settings = get_settings()
    storage_account_name = settings.azure_storage_account_name
    base = f"https://{storage_account_name}.blob.core.windows.net/"
    pull_menu = f"{base}pull-model-menus/"
    return base, pull_menu


def get_pull_menu_main_url() -> str:
    return _get_base_urls()[1]


def get_content_url() -> str:
    base, _ = _get_base_urls()
    return f"{base}output-container/"


# ---------------------------------------------------------------------------
# Language dialog URLs (relative paths, prepend pullMenuMainUrl)
# ---------------------------------------------------------------------------

languageDialogUrls: dict[str, str] = {
    "en": "languageDialog/english/For%20English/{speechRate}.mp3",
    "kn": "languageDialog/kannada/For%20Kannada/{speechRate}.mp3",
    "bn": "languageDialog/bengali/For%20Bengali/{speechRate}.mp3",
    "hi": "languageDialog/hindi/For%20Hindi/{speechRate}.mp3",
    "ta": "languageDialog/tamil/For%20Tamil/{speechRate}.mp3",
    "or": "languageDialog/odia/For%20Odia/{speechRate}.mp3",
    "mr": "languageDialog/marathi/For%20Marathi/{speechRate}.mp3",
}

speechRate = "1.0"

readingContentTitlesDialogUrl: dict[str, str] = {
    "story": "readingContentTitlesDialog/{language}/story/{speechRate}.mp3",
    "poem": "readingContentTitlesDialog/{language}/poetry/{speechRate}.mp3",
    "song": "readingContentTitlesDialog/{language}/music/{speechRate}.mp3",
    "snippet": "readingContentTitlesDialog/{language}/snippet/{speechRate}.mp3",
    "riddle": "readingContentTitlesDialog/{language}/riddle/{speechRate}.mp3",
    "quiz": "readingContentTitlesDialog/{language}/quiz/{speechRate}.mp3",
    "scramble": "readingContentTitlesDialog/{language}/scramble/{speechRate}.mp3",
    "theme": "readingContentTitlesDialog/{language}/theme/{speechRate}.mp3",
}

next4MessageUrls: dict[str, str] = {
    "language": "next4Dialog/{language}/language/{speechRate}.mp3",
    "story": "next4Dialog/{language}/story/{speechRate}.mp3",
    "poem": "next4Dialog/{language}/poetry/{speechRate}.mp3",
    "song": "next4Dialog/{language}/music/{speechRate}.mp3",
    "scramble": "next4Dialog/{language}/scramble/{speechRate}.mp3",
    "quiz": "next4Dialog/{language}/quiz/{speechRate}.mp3",
    "snippet": "next4Dialog/{language}/snippet/{speechRate}.mp3",
    "riddle": "next4Dialog/{language}/riddle/{speechRate}.mp3",
    "experience": "next4Dialog/{language}/experience/{speechRate}.mp3",
    "theme": "next4Dialog/{language}/theme/{speechRate}.mp3",
}

prev4MessageUrls: dict[str, str] = {
    "language": "prev4Dialog/{language}/language/{speechRate}.mp3",
    "story": "prev4Dialog/{language}/story/{speechRate}.mp3",
    "poem": "prev4Dialog/{language}/poetry/{speechRate}.mp3",
    "song": "prev4Dialog/{language}/music/{speechRate}.mp3",
    "scramble": "prev4Dialog/{language}/scramble/{speechRate}.mp3",
    "quiz": "prev4Dialog/{language}/quiz/{speechRate}.mp3",
    "snippet": "prev4Dialog/{language}/snippet/{speechRate}.mp3",
    "riddle": "prev4Dialog/{language}/riddle/{speechRate}.mp3",
    "experience": "prev4Dialog/{language}/experience/{speechRate}.mp3",
    "theme": "prev4Dialog/{language}/theme/{speechRate}.mp3",
}

experienceNames: dict[str, list] = {
    "english": ["story", "poem", "song", "snippet", "riddle"]
}

experienceDialogAudioUrls: dict[str, str] = {
    "story": "{pullMenu}experiencesDialog/{language}/story/For%20Stories/{speechRate}.mp3",
    "poem": "{pullMenu}experiencesDialog/{language}/poetry/For%20Rhymes/{speechRate}.mp3",
    "song": "{pullMenu}experiencesDialog/{language}/music/For%20Songs/{speechRate}.mp3",
    "keyLearning": "{pullMenu}experiencesDialog/{language}/keyLearning/to%20learn%20phone%20keys/{speechRate}.mp3",
    "scramble": "{pullMenu}experiencesDialog/{language}/scramble/to%20play%20Scramble%20Game/{speechRate}.mp3",
    "quiz": "{pullMenu}experiencesDialog/{language}/quiz/to%20play%20quiz/{speechRate}.mp3",
    "snippet": "{pullMenu}experiencesDialog/{language}/snippet/For%20Snippets/{speechRate}.mp3",
    "riddle": "{pullMenu}experiencesDialog/{language}/riddle/For%20Riddles/{speechRate}.mp3",
}

repeatCurrentMenuUrl = "repeatMenuDialog/{language}/To%20repeat%20Current%20Menu/{speechRate}.mp3"
repeatContentUrl = "contentPlayingDialogs/{language}/toRepeatContent/{speechRate}.mp3"
exitContentUrl = "contentPlayingDialogs/{language}/toExitContent/{speechRate}.mp3"
goToPreviousMenuMessageUrl = "previousMenuDialog/{language}/To%20go%20to%20Previous%20Menu/{speechRate}.mp3"
pressKeyMessageUrl = "pressKeysDialog/{language}/{key}/{speechRate}.mp3"
audioGoingTobePlayedDialogUrl = "audioDialogs/{language}/audioGoingToBePlayedDialog/{speechRate}.mp3"
audioFinishedMessageUrl = "audioDialogs/{language}/audioFinishedDialog/{speechRate}.mp3"

# Navigation key constants
number_of_categories_listed_in_one_state = 4
next_n_categories_key = "5"
previous_n_categories_key = "7"
repeat_current_categories_key = "8"
previous_category_level_key = "9"

content_attributes = [
    {"category": "language", "level": 0, "id": "LA"},
    {"category": "theme", "level": 1, "id": "TH"},
    {"category": "type", "level": 2, "id": "EX"},
    {"category": "title", "level": 3, "id": "TI"},
]
