"""FSM instantiation from MongoDB content.

Ported from IVRv2/app/fsm/insti.py — import paths updated, logic unchanged.
"""

from __future__ import annotations

import re
import uuid
from typing import Dict, List, Optional

from app.models.ivr_state import IVRfsmDoc
from app.providers.vonage_actions.input_action import InputAction
from app.providers.vonage_actions.stream_action import StreamAction
from app.providers.vonage_actions.talk_action import TalkAction
from app.platform.settings import get_settings
from app.services.fsm.fsm import FSM
from app.services.fsm.instantiation.ivr_constants import (
    audioGoingTobePlayedDialogUrl,
    content_attributes,
    experienceDialogAudioUrls,
    get_pull_menu_main_url,
    goToPreviousMenuMessageUrl,
    languageDialogUrls,
    next4MessageUrls,
    next_n_categories_key,
    number_of_categories_listed_in_one_state,
    prev4MessageUrls,
    previous_category_level_key,
    previous_n_categories_key,
    pressKeyMessageUrl,
    readingContentTitlesDialogUrl,
    repeat_current_categories_key,
    repeatCurrentMenuUrl,
    speechRate,
)
from app.services.fsm.state import State
from app.services.fsm.transition import Transition
from motor.motor_asyncio import AsyncIOMotorDatabase


class _Option:
    def __init__(self, key: int, value: str) -> None:
        self.key = key
        self.value = value


class _Menu:
    def __init__(self, description: str, options: list, level: int, language: str = "") -> None:
        self.description = description
        self.options = options
        self.level = level
        self.language = language

    def dict(self, **kwargs) -> dict:  # noqa: ANN001
        return {
            "description": self.description,
            "options": [{"key": o.key, "value": o.value} for o in (self.options or [])],
            "level": self.level,
            "language": self.language,
        }


# Module-level InputAction instance
_input_action = InputAction(type_=["dtmf"], eventApi="/input")


def _get_welcome_url() -> str:
    settings = get_settings()
    pullMenuMainUrl = get_pull_menu_main_url()
    return (
        f"{pullMenuMainUrl}welcomeDialog/{settings.default_welcome_language}"
        f"/welcome%20to%20SEEDS/1.0.mp3"
    )


def _get_key_press_url(key: str, language: str, speech_rate: str) -> str:
    pullMenuMainUrl = get_pull_menu_main_url()
    replaced_url = (
        pressKeyMessageUrl.replace("{language}", language)
        .replace("{speechRate}", str(speech_rate))
    )
    replaced_url = re.sub(r"\{key\}", key, replaced_url)
    return pullMenuMainUrl + replaced_url


def handle_language(
    filtered_content: list, speech_rate: str, parent_selections: dict
) -> tuple[list, dict, list]:
    languages = [item["language"].lower() for item in filtered_content]
    unique_languages = set(languages)
    count_languages = {lang: languages.count(lang) for lang in unique_languages}
    sorted_languages = sorted(count_languages.items(), key=lambda x: x[1], reverse=True)
    sorted_langs = [lang for lang, _ in sorted_languages]
    sorted_langs = [lang for lang in sorted_langs if lang in languageDialogUrls]

    pullMenuMainUrl = get_pull_menu_main_url()
    values_to_urls: dict = {}
    sorted_categories: list = []
    sorted_keys: list = []
    for lang in sorted_langs:
        template_url = languageDialogUrls[lang]
        complete_url = pullMenuMainUrl + template_url.replace("{speechRate}", str(speech_rate))
        values_to_urls[lang] = complete_url
        sorted_categories.append(complete_url)
        sorted_keys.append(lang)
    return sorted_categories, values_to_urls, sorted_keys


def handle_theme(
    filtered_content: list, speech_rate: str, parent_selections: dict
) -> tuple[list, dict, list]:
    themes = sorted({item["theme"]["local"] for item in filtered_content})
    values_to_urls: dict = {}
    sorted_categories: list = []
    sorted_keys: list = []
    for theme in themes:
        theme_items = [item for item in filtered_content if item["theme"]["local"] == theme]
        complete_url = theme_items[0]["theme"]["audioUrl"]
        values_to_urls[theme] = complete_url
        sorted_categories.append(complete_url)
        sorted_keys.append(theme)
    return sorted_categories, values_to_urls, sorted_keys


def handle_type(
    filtered_content: list, speech_rate: str, parent_selections: dict
) -> tuple[list, dict, list]:
    settings = get_settings()
    pullMenuMainUrl = get_pull_menu_main_url()

    experiences = sorted({item["type"].lower() for item in filtered_content})
    values_to_urls: dict = {}
    sorted_categories: list = []
    sorted_keys: list = []
    language = parent_selections.get("language", settings.default_welcome_language)
    for exp in experiences:
        template_url = experienceDialogAudioUrls.get(exp, "")
        if not template_url:
            continue
        audio_url = (
            template_url
            .replace("{pullMenu}", pullMenuMainUrl)
            .replace("{language}", language)
            .replace("{speechRate}", str(speech_rate))
        )
        values_to_urls[exp] = audio_url
        sorted_categories.append(audio_url)
        sorted_keys.append(exp)
    return sorted_categories, values_to_urls, sorted_keys


def handle_title(
    filtered_content: list, speech_rate: str, parent_selections: dict
) -> tuple[list, dict, list]:
    is_quiz = parent_selections.get("type", "").lower() == "quiz" or (
        filtered_content and filtered_content[0].get("type", "").lower() == "quiz"
    )

    values_to_urls: dict = {}
    sorted_categories: list = []
    sorted_keys: list = []

    if is_quiz:
        titles = sorted({item["localTitle"] for item in filtered_content})
        for title in titles:
            quiz_items = [item for item in filtered_content if item["localTitle"] == title]
            complete_url = quiz_items[0]["titleAudio"]
            values_to_urls[title] = complete_url
            sorted_categories.append(complete_url)
            sorted_keys.append(title)
    else:
        titles = sorted({item["title"]["local"] for item in filtered_content})
        for title in titles:
            title_items = [item for item in filtered_content if item["title"]["local"] == title]
            complete_url = title_items[0]["title"]["audioUrl"]
            values_to_urls[title] = complete_url
            sorted_categories.append(complete_url)
            sorted_keys.append(title)
    return sorted_categories, values_to_urls, sorted_keys


_attribute_handlers = {
    "language": handle_language,
    "theme": handle_theme,
    "type": handle_type,
    "title": handle_title,
}


def _add_nav_action(
    actions: list,
    key_to_value_mapping: dict,
    nav_key: int | str,
    message_template: str,
    language: str,
    speech_rate: str,
    description: str,
) -> None:
    pullMenuMainUrl = get_pull_menu_main_url()
    url = pullMenuMainUrl + message_template.replace("{language}", language).replace(
        "{speechRate}", str(speech_rate)
    )
    actions.append(StreamAction(url))
    actions.append(StreamAction(_get_key_press_url(str(nav_key), language, speech_rate)))
    key_to_value_mapping[int(nav_key)] = description


def _get_stream_actions(
    items_list: list,
    sorted_keys: list,
    level: int,
    state: int,
    parent_selections: dict,
) -> dict:
    settings = get_settings()

    category = content_attributes[level]["category"]
    actions: list = []
    key_to_value_mapping: dict = {}

    language = parent_selections.get("language", settings.default_welcome_language)

    if level == 0 and state == 0:
        actions.append(StreamAction(_get_welcome_url()))

    initial_dialog = None
    pullMenuMainUrl = get_pull_menu_main_url()
    if state == 0:
        if category == "theme":
            initial_dialog = readingContentTitlesDialogUrl["theme"]
        elif category == "title":
            if "type" not in parent_selections or not parent_selections["type"]:
                raise ValueError("Missing 'type' in parent_selections for title initial dialog")
            initial_dialog = readingContentTitlesDialogUrl[parent_selections["type"].lower()]
        if initial_dialog:
            dialog_url = (
                pullMenuMainUrl
                + initial_dialog.replace("{language}", language).replace("{speechRate}", str(speechRate))
            )
            actions.append(StreamAction(dialog_url))

    start_index = state * number_of_categories_listed_in_one_state
    end_index = min(
        (state + 1) * number_of_categories_listed_in_one_state, len(items_list)
    )
    for idx, complete_url in enumerate(items_list[start_index:end_index]):
        display_value = sorted_keys[start_index + idx]
        actions.append(StreamAction(complete_url))
        key = str(idx + 1)
        key_to_value_mapping[int(key)] = display_value
        option_language = display_value.lower() if category == "language" else language
        actions.append(StreamAction(_get_key_press_url(key, option_language, speechRate)))

    total_pages = (
        len(items_list) + number_of_categories_listed_in_one_state - 1
    ) // number_of_categories_listed_in_one_state

    if total_pages > 1 and state < total_pages - 1:
        next_message = next4MessageUrls.get(category)
        if next_message:
            _add_nav_action(
                actions, key_to_value_mapping, next_n_categories_key,
                next_message, language, speechRate, f"next {number_of_categories_listed_in_one_state} items",
            )

    if total_pages > 1 and state > 0:
        prev_message = prev4MessageUrls.get(category)
        if prev_message:
            _add_nav_action(
                actions, key_to_value_mapping, previous_n_categories_key,
                prev_message, language, speechRate, f"previous {number_of_categories_listed_in_one_state} items",
            )

    _add_nav_action(
        actions, key_to_value_mapping, repeat_current_categories_key,
        repeatCurrentMenuUrl, language, speechRate, "repeatCurrentMenu",
    )

    if level != 0 and len(content_attributes) > 1:
        _add_nav_action(
            actions, key_to_value_mapping, previous_category_level_key,
            goToPreviousMenuMessageUrl, language, speechRate, "previous category level",
        )

    options = [_Option(key=k, value=v) for k, v in key_to_value_mapping.items()]
    menu = _Menu(
        description=f"{category.capitalize()} menu",
        options=options,
        level=level,
        language=language,
    )
    return {"actions": actions, "menu": menu}


def _extract_parent_info(parent_state_id: str) -> tuple[str, int]:
    index_of_last_op = parent_state_id.rfind("Op")
    if index_of_last_op == -1:
        raise ValueError("Invalid parent_state_id format: missing 'Op'")
    parent_block_state_id = parent_state_id[: (index_of_last_op - 1)]
    option_chosen = parent_state_id[index_of_last_op + 2 :][:-1]
    index_of_digit = option_chosen.find("(")
    if index_of_digit == -1:
        raise ValueError("Invalid parent_state_id format: missing '('")
    key_for_option_chosen = int(option_chosen[:index_of_digit]) + 1
    return parent_block_state_id, key_for_option_chosen


def _create_child_state_id(current_page_state_id: str, option_index: int, display_value: str) -> str:
    return f"{current_page_state_id}-Op{option_index}({display_value})-"


def _get_comparable_value(item: dict, key: str) -> object:
    value = item.get(key)
    if isinstance(value, dict) and "local" in value:
        return value["local"]
    return value


def generate_states(
    fsm: FSM,
    content_list: list,
    content_attrs: list,
    level: int,
    parent_state_id: str = "",
    parent_selections: dict | None = None,
) -> None:
    if parent_selections is None:
        parent_selections = {}

    if level == len(content_attrs):
        # Leaf node — create pure audio or quiz content state
        filtered_content = [
            item
            for item in content_list
            if all(
                str(_get_comparable_value(item, k)).lower() == str(v).lower()
                for k, v in parent_selections.items()
            )
        ]
        if not filtered_content:
            raise ValueError(f"No matching content for selections: {parent_selections}")

        content_type = filtered_content[0].get("type", "").lower()
        parent_block_state_id, key_for_option_chosen = _extract_parent_info(parent_state_id)

        if content_type == "quiz":
            from app.services.fsm.instantiation.quiz import Quiz  # noqa: PLC0415
            from app.models.quiz import QuizData  # type: ignore[attr-defined]  # noqa: PLC0415
            try:
                quiz_data = QuizData(**filtered_content[0])
            except Exception:  # noqa: BLE001
                # Fallback to a simple dict-based quiz data
                quiz_data = _SimpleQuizData(filtered_content[0])  # type: ignore[assignment]
            quiz = Quiz(quiz_data)
            quiz.generate_states(
                fsm, parent_state_id, parent_block_state_id, key_for_option_chosen, level
            )
        else:
            from app.services.fsm.instantiation.pure_audio import PureAudio  # noqa: PLC0415
            from app.models.content import PureAudioData  # type: ignore[attr-defined]  # noqa: PLC0415
            try:
                content_data = PureAudioData(**filtered_content[0])
            except Exception:  # noqa: BLE001
                content_data = _SimplePureAudioData(filtered_content[0])  # type: ignore[assignment]
            pure_audio = PureAudio(content_data, speechRate)
            pure_audio.generate_state(
                fsm, parent_state_id, parent_block_state_id, key_for_option_chosen, level
            )
        return

    filtered_content = [
        item
        for item in content_list
        if all(
            str(_get_comparable_value(item, k)).lower() == str(v).lower()
            for k, v in parent_selections.items()
        )
    ]

    current_attr = content_attrs[level]["category"]
    category_id_prefix = content_attrs[level]["id"]

    sorted_categories, values_to_urls, sorted_keys = _attribute_handlers[current_attr](
        filtered_content, speechRate, parent_selections
    )
    n_states = (
        len(sorted_categories) + number_of_categories_listed_in_one_state - 1
    ) // number_of_categories_listed_in_one_state

    for state_index in range(n_states):
        state_id = f"{parent_state_id}{category_id_prefix}{state_index}"
        result = _get_stream_actions(
            sorted_categories, sorted_keys, level, state_index, parent_selections
        )
        actions = result["actions"]
        menu = result["menu"]
        if level < len(content_attrs):
            actions.append(_input_action)
        fsm.add_state(State(state_id=state_id, actions=actions, menu=menu))

        if level > 0 and state_index == 0:
            parent_block_state_id, key_for_option_chosen = _extract_parent_info(parent_state_id)
            fsm.add_transition(
                Transition(
                    source_state_id=parent_block_state_id,
                    dest_state_id=state_id,
                    input=str(key_for_option_chosen),
                    actions=[],
                )
            )

    for state_index in range(n_states):
        state_id = f"{parent_state_id}{category_id_prefix}{state_index}"
        if n_states > 1:
            if state_index != 0:
                fsm.add_transition(
                    Transition(
                        source_state_id=state_id,
                        dest_state_id=f"{parent_state_id}{category_id_prefix}{state_index - 1}",
                        input=previous_n_categories_key,
                        actions=[],
                    )
                )
            if state_index != n_states - 1:
                fsm.add_transition(
                    Transition(
                        source_state_id=state_id,
                        dest_state_id=f"{parent_state_id}{category_id_prefix}{state_index + 1}",
                        input=next_n_categories_key,
                        actions=[],
                    )
                )
        fsm.add_transition(
            Transition(
                source_state_id=state_id,
                dest_state_id=state_id,
                input=str(repeat_current_categories_key),
                actions=[],
            )
        )
        if level != 0 and len(content_attrs) > 1:
            parent_block_state_id, _ = _extract_parent_info(parent_state_id)
            fsm.add_transition(
                Transition(
                    source_state_id=state_id,
                    dest_state_id=parent_block_state_id,
                    input=previous_category_level_key,
                    actions=[],
                )
            )

        indexes_possible = (
            min(
                (state_index + 1) * number_of_categories_listed_in_one_state,
                len(sorted_categories),
            )
            - state_index * number_of_categories_listed_in_one_state
        )
        for index_of_category in range(indexes_possible):
            index_of_item = state_index * number_of_categories_listed_in_one_state + index_of_category
            new_selections = parent_selections.copy()
            new_selections[current_attr] = sorted_keys[index_of_item]
            new_state_id = _create_child_state_id(state_id, index_of_category, sorted_keys[index_of_item])
            if level + 1 <= len(content_attrs):
                generate_states(
                    fsm, content_list, content_attrs, level + 1, new_state_id, new_selections
                )


async def instantiate_from_latest_content(
    content_ids: Optional[List[str]] = None,
    db: Optional[AsyncIOMotorDatabase] = None,
) -> FSM:
    """Build an FSM from MongoDB pull-model content.

    Args:
        content_ids: Optional list of content IDs to restrict to.
        db: Motor database instance.  If None, retrieves from app.platform.database.

    Returns:
        A fully constructed FSM instance.
    """
    if db is None:
        from app.platform.database import get_database  # noqa: PLC0415
        db = get_database()

    if content_ids:
        query: dict = {
            "_id": {"$in": content_ids},
            "isPullModel": True,
            "isDeleted": {"$ne": True},
        }
    else:
        query = {"isPullModel": True, "isDeleted": {"$ne": True}}

    cursor = db["contentsV3"].find(query)
    content = await cursor.to_list(length=None)

    fsm = FSM(fsm_id=str(uuid.uuid4()))
    fsm.set_end_state(
        State(
            state_id="END",
            actions=[TalkAction(text="You didn't choose a valid option. Bye bye.", bargeIn=False)],
        )
    )
    generate_states(fsm, content, content_attributes, 0, parent_selections={})
    return fsm


def instantitate_from_doc(data: IVRfsmDoc) -> FSM:
    """Deserialize an FSM from a stored IVRfsmDoc."""
    return FSM.deserialize(data)


# ---------------------------------------------------------------------------
# Lightweight data-class fallbacks when model classes are not importable
# ---------------------------------------------------------------------------

class _SimpleQuizData:
    def __init__(self, data: dict) -> None:
        self.id = data.get("id", "")
        self.language = data.get("language", "")
        self.theme = data.get("theme", "")
        self.themeAudio = data.get("themeAudio", "")
        self.title = data.get("title", "")
        self.localTitle = data.get("localTitle", "")
        self.titleAudio = data.get("titleAudio", "")
        self.positiveMarks = data.get("positiveMarks", 1)
        self.negativeMarks = data.get("negativeMarks", 0)
        self.questions = [_SimpleQuizQuestion(q) for q in data.get("questions", [])]


class _SimpleQuizQuestion:
    def __init__(self, data: dict) -> None:
        self.question = _SimpleURLText(data.get("question", {}))
        self.options = [_SimpleURLText(o) for o in data.get("options", [])]
        self.correct_option_id = data.get("correct_option_id", "")


class _SimpleURLText:
    def __init__(self, data: dict) -> None:
        self.id = data.get("id", "")
        self.url = data.get("url", "")
        self.text = data.get("text", "")


class _SimplePureAudioData:
    def __init__(self, data: dict) -> None:
        self.id = data.get("_id", data.get("id", ""))
        self.type = data.get("type", "")
        self.description = data.get("description", "")
        self.language = data.get("language", "kannada")
        title_data = data.get("title", {})
        self.title = type("_T", (), {
            "english": title_data.get("english", ""),
            "local": title_data.get("local", ""),
            "audioUrl": title_data.get("audioUrl", ""),
        })()
        theme_data = data.get("theme", {})
        self.theme = type("_Th", (), {
            "english": theme_data.get("english", ""),
            "local": theme_data.get("local", ""),
            "audioUrl": theme_data.get("audioUrl", ""),
        })()
        audio_content = data.get("audioContent", [])
        self.audioContent = [
            type("_AC", (), {
                "description": ac.get("description", ""),
                "audioUrl": ac.get("audioUrl", ""),
                "durationSeconds": ac.get("durationSeconds"),
            })()
            for ac in audio_content
        ]
        self.isPullModel = data.get("isPullModel", False)
        self.isTeacherApp = data.get("isTeacherApp", False)
        self.createdBy = data.get("createdBy", "")
        self.creation_time = data.get("creation_time", 0)
        self.isDeleted = data.get("isDeleted", False)
        self.school_id = data.get("school_id", "")
