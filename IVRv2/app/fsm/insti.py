import uuid
from app.actions.base_actions.talk_action import TalkAction
from app.actions.base_actions.stream_action import StreamAction
from app.actions.base_actions.input_action import InputAction
from app.fsm.pureAudio import PureAudio

from app.fsm.state import State
from app.fsm.transition import Transition
from app.fsm.fsm import FSM
from app.fsm.quiz import Quiz
import os
from dotenv import load_dotenv
import json
import re
import requests
import aiohttp
import asyncio
from typing import List, Optional

from app.utils.model_classes import IVRfsmDoc
from app.utils.pure_audio_model_classes import PureAudioData
from app.utils.sas_gen import SASGen
from app.utils.model_classes import Menu
from app.utils.model_classes import Option
from app.utils.quiz_model_classes import QuizData
from app.utils.quiz_model_classes import QuizQuestion
from app.utils.quiz_model_classes import URLTextEntity
from app.fsm.ivr_constants import (
    pullMenuMainUrl,
    content_url,
    url,
    headers,
    languageDialogUrls,
    speechRate,
    readingContentTitlesDialogUrl,
    next4MessageUrls,
    prev4MessageUrls,
    experienceNames,
    experienceDialogAudioUrls,
    repeatCurrentMenuUrl,
    repeatContentUrl,
    exitContentUrl,
    goToPreviousMenuMessageUrl,
    pressKeyMessageUrl,
    audioGoingTobePlayedDialogUrl,
    audioFinishedMessageUrl,
    number_of_categories_listed_in_one_state,
    next_n_categories_key,
    previous_n_categories_key,
    repeat_current_categories_key,
    previous_category_level_key,
    quiz_new,
)
from app.fsm.ivr_utils import get_content
from app.core.database import MongoDBCollection
from app.settings import settings
load_dotenv()

input_action = InputAction(type_=["dtmf"], eventApi="/input")

content_attributes = [
    {"category": "language", "level": 0, "id": "LA"},
    {"category": "theme", "level": 1, "id": "TH"},
    {"category": "type", "level": 2, "id": "EX"},
    {"category": "title", "level": 3, "id": "TI"},
]


def handle_language(filtered_content, speechRate, parent_selections):
    """
    handle_language(filtered_content, speechRate, parent_selections)
    ---------------------------------------------------------------
    Extracts language options from the filtered content and builds complete URLs.

    Parameters:
      filtered_content (list): List of content dictionaries filtered based on previous selections.
      speechRate (str): The speech rate string (e.g., "1.0").
      parent_selections (dict): Dictionary of prior selections (used to determine the language; defaults to "kannada").

    Returns:
      sorted_categories (list): A list of complete audio URLs corresponding to each language.
        Example: ["https://seedsstagingblob.blob.core.windows.net/pull-model-menus/<...>/kannada/1.0.mp3", ...]
      values_to_urls (dict): A mapping from each language (in lowercase) to its complete audio URL.
        Example: {"kannada": "https://seedsstagingblob.blob.core.windows.net/pull-model-menus/<...>/kannada/1.0.mp3", ...}
    """
    languages = [item["language"].lower() for item in filtered_content]
    unique_languages = set(languages)
    # Count occurrences for sorting by frequency.
    count_languages = {lang: languages.count(lang) for lang in unique_languages}
    sorted_languages = sorted(count_languages.items(), key=lambda x: x[1], reverse=True)
    sorted_langs = [lang for lang, _ in sorted_languages]

    values_to_urls = {}
    sorted_categories = []
    sorted_keys = []
    for lang in sorted_langs:
        # Retrieve the URL template from languageDialogUrls and substitute {speechRate}.
        template_url = languageDialogUrls[lang]
        complete_url = pullMenuMainUrl + template_url.replace(
            "{speechRate}", str(speechRate)
        )
        values_to_urls[lang] = complete_url
        sorted_categories.append(complete_url)
        sorted_keys.append(lang)
    return sorted_categories, values_to_urls, sorted_keys


def handle_theme(filtered_content, speechRate, parent_selections):
    """
    handle_theme(filtered_content, speechRate, parent_selections)
    -------------------------------------------------------------
    Extracts theme options from the filtered content and returns complete URLs.

    Parameters:
      filtered_content (list): List of content dictionaries.
      speechRate (str): The speech rate string (e.g., "1.0"). Not used here because the URL is already complete.
      parent_selections (dict): Dictionary of prior selections (e.g., language).

    Returns:
      sorted_categories (list): A list of complete audio URLs corresponding to each theme.
        Example: ["https://seedsstagingblob.blob.core.windows.net/theme-titles/Our%20body%20and%20its%20functions/1.0.mp3", ...]
      values_to_urls (dict): A mapping from the theme’s local display name to its complete audio URL.
        Example: {"ನಮ್ಮ ದೇಹ ಮತ್ತು ಅದರ ಕಾರ್ಯಗಳು": "https://seedsstagingblob.blob.core.windows.net/theme-titles/Our%20body%20and%20its%20functions/1.0.mp3", ...}
    """
    print(filtered_content[0:5])
    themes = sorted({item["theme"]["local"] for item in filtered_content})
    values_to_urls = {}
    sorted_categories = []
    sorted_keys = []
    for theme in themes:
        # Get the first item matching this theme local value.
        theme_items = [
            item for item in filtered_content if item["theme"]["local"] == theme
        ]
        # Directly use the URL since it is already complete.
        complete_url = theme_items[0]["theme"]["audioUrl"]
        values_to_urls[theme] = complete_url
        sorted_categories.append(complete_url)
        sorted_keys.append(theme)
    return sorted_categories, values_to_urls, sorted_keys


"""
handle_type(filtered_content, speechRate, parent_selections)
------------------------------------------------------------
Extracts experience type options from the filtered content.

Parameters:
  filtered_content (list): List of content dictionaries.
  speechRate (str): The speech rate string (not used directly for type).
  parent_selections (dict): Dictionary of prior selections (not used here, but included for uniformity).

Returns:
  sorted_categories (list): A list of audio URLs corresponding to each experience type.
    Example: ["https://seedsstagingblob.blob.core.windows.net/pull-model-menus/experiencesDialog/kannada/music/For%20Songs/1.0.mp3"]
  values_to_urls (dict): A mapping from the type (in lowercase) to its audio URL.
    Example: {"song": "https://seedsstagingblob.blob.core.windows.net/pull-model-menus/experiencesDialog/kannada/music/For%20Songs/1.0.mp3"}
"""


def handle_type(filtered_content, speechRate, parent_selections):
    # Extract and sort experience types (converted to lowercase).
    experiences = sorted({item["type"].lower() for item in filtered_content})
    values_to_urls = {}
    sorted_categories = []
    sorted_keys = []
    language = parent_selections.get("language", "kannada")
    for exp in experiences:
        # Retrieve the URL template from the global mapping.
        template_url = experienceDialogAudioUrls[exp]
        # Replace the placeholders with the actual language and speechRate.
        audio_url = template_url.replace("{language}", language).replace(
            "{speechRate}", str(speechRate)
        )
        values_to_urls[exp] = audio_url
        sorted_categories.append(audio_url)
        sorted_keys.append(exp)
    return sorted_categories, values_to_urls, sorted_keys


def handle_title(filtered_content, speechRate, parent_selections):
    """
    handle_title(filtered_content, speechRate, parent_selections)
    -------------------------------------------------------------
    Extracts title options from the filtered content and returns complete URLs.
    For quiz content, it uses the quiz-specific fields ('localTitle' and 'titleAudio').
    For non-quiz content, it uses the nested 'title' dictionary with 'local' and 'audioUrl'.

    Parameters:
      filtered_content (list): List of content dictionaries.
      speechRate (str): The speech rate string (e.g., "1.0"). Not used if URLs are already complete.
      parent_selections (dict): Dictionary of prior selections; used to check if the type is "quiz".

    Returns:
      sorted_categories (list): A list of complete audio URLs corresponding to each title.
        Example (quiz): ["https://seedsstagingblob.blob.core.windows.net/experience-titles/quiz/12f77743-4255-48a8-855b-2f4d7b635c95/1.0.mp3"]
        Example (non-quiz): ["https://seedsstagingblob.blob.core.windows.net/experience-titles/20/1.0.mp3"]
      values_to_urls (dict): A mapping from the title’s display name to its complete audio URL.
        Example (quiz): {"ಮೊಲದ ಮರಿ": "https://seedsstagingblob.blob.core.windows.net/experience-titles/quiz/12f77743-4255-48a8-855b-2f4d7b635c95/1.0.mp3"}
        Example (non-quiz): {"ನಾನು ಮತ್ತು ನನ್ನ ಶರೀರ": "https://seedsstagingblob.blob.core.windows.net/experience-titles/20/1.0.mp3"}
    """
    values_to_urls = {}
    sorted_categories = []
    sorted_keys = []

    # Determine if we are handling quiz content
    is_quiz = parent_selections.get("type", "").lower() == "quiz" or (
        filtered_content and filtered_content[0].get("type", "").lower() == "quiz"
    )

    if is_quiz:
        # For quiz objects, use the 'localTitle' and 'titleAudio' fields directly.
        titles = sorted({item["localTitle"] for item in filtered_content})
        for title in titles:
            quiz_items = [
                item for item in filtered_content if item["localTitle"] == title
            ]
            # Use the provided titleAudio as is.
            complete_url = quiz_items[0]["titleAudio"]
            values_to_urls[title] = complete_url
            sorted_categories.append(complete_url)
            sorted_keys.append(title)
    else:
        # For non-quiz content, use the nested title fields.
        titles = sorted({item["title"]["local"] for item in filtered_content})
        for title in titles:
            title_items = [
                item for item in filtered_content if item["title"]["local"] == title
            ]
            complete_url = title_items[0]["title"]["audioUrl"]
            values_to_urls[title] = complete_url
            sorted_categories.append(complete_url)
            sorted_keys.append(title)
    return sorted_categories, values_to_urls, sorted_keys


# Mapping attribute names to their corresponding helper functions.
attribute_handlers = {
    "language": handle_language,
    "theme": handle_theme,
    "type": handle_type,
    "title": handle_title,
}

welcomeToSEEDSKannadaUrl = f"https://{settings.storage_account_name}.blob.core.windows.net/pull-model-menus/welcomeDialog/kannada/welcome%20to%20SEEDS/1.0.mp3"


def getKeyPressUrl(key, language, speechRate):
    replaced_url = pressKeyMessageUrl.replace("{language}", language).replace(
        "{speechRate}", str(speechRate)
    )
    replaced_url = re.sub(r"\{key\}", key, replaced_url)
    return pullMenuMainUrl + replaced_url


def add_nav_action(
    actions,
    key_to_value_mapping,
    nav_key,
    message_template,
    language,
    speechRate,
    description,
):
    """
    Helper function to add a navigation action.

    Parameters:
      actions (list): The list of StreamAction objects to update.
      key_to_value_mapping (dict): The mapping from keys to display values.
      nav_key (int or str): The key (as number/string) to be pressed for this navigation option.
      message_template (str): The URL template for the navigation message.
      language (str): The language to substitute in the template.
      speechRate (str): The speech rate value.
      description (str): The description text to assign for this key.
    """
    url = pullMenuMainUrl + message_template.replace("{language}", language).replace(
        "{speechRate}", str(speechRate)
    )
    actions.append(StreamAction(url))
    actions.append(StreamAction(getKeyPressUrl(str(nav_key), language, speechRate)))
    key_to_value_mapping[int(nav_key)] = description


def getStreamActions(items_list, sorted_keys, level, state, parent_selections={}):
    """
    Builds the stream actions and menu for the current FSM state.

    Parameters:
      items_list (list): A list of complete URLs for the current attribute's menu options.
      sorted_keys (list): A list of display values corresponding to each URL in items_list.
      level (int): The current attribute level.
      state (int): The current page index (if items are paginated).
      parent_selections (dict): The selections made in previous levels.

    Returns:
      dict: A dictionary with keys 'actions' (list of stream actions) and 'menu' (a Menu object)
            that includes the key mapping for this state.
    """

    category = content_attributes[level]["category"]
    description = f"{category.capitalize()} menu"

    actions = []
    key_to_value_mapping = {}
    description = f"{category.capitalize()} menu"

    language = parent_selections.get("language", "kannada")

    if level == 0 and state == 0:
        actions.append(StreamAction(welcomeToSEEDSKannadaUrl))

    # Optionally, play an initial dialog specific to the attribute.
    # (For example, for "theme" or "title", an initial prompt may be defined.)
    initial_dialog = None
    if state == 0:
        if category == "theme":
            # Use the theme key directly.
            initial_dialog = readingContentTitlesDialogUrl["theme"]
        elif category == "title":
            # Require that 'type' is present in parent_selections.
            if "type" not in parent_selections or not parent_selections["type"]:
                raise ValueError(
                    "Missing 'type' in parent_selections; this is required for title initial dialog."
                )
            initial_dialog = readingContentTitlesDialogUrl[
                parent_selections["type"].lower()
            ]
        if initial_dialog:
            dialog_url = pullMenuMainUrl + initial_dialog.replace(
                "{language}", language
            ).replace("{speechRate}", str(speechRate))
            actions.append(StreamAction(dialog_url))

    start_index = state * number_of_categories_listed_in_one_state
    end_index = min(
        (state + 1) * number_of_categories_listed_in_one_state, len(items_list)
    )
    for idx, complete_url in enumerate(items_list[start_index:end_index]):
        # The corresponding display value for this option.
        display_value = sorted_keys[start_index + idx]
        actions.append(StreamAction(complete_url))
        key = str(idx + 1)  # DTMF keys start at 1.
        key_to_value_mapping[int(key)] = display_value
        option_language = display_value.lower() if category == "language" else language
        actions.append(StreamAction(getKeyPressUrl(key, option_language, speechRate)))

    total_pages = (
        len(items_list) + number_of_categories_listed_in_one_state - 1
    ) // number_of_categories_listed_in_one_state
    # Navigation actions.
    if total_pages > 1 and state < total_pages - 1:
        # Next page.
        next_message = next4MessageUrls.get(category)
        if next_message:
            add_nav_action(
                actions,
                key_to_value_mapping,
                next_n_categories_key,
                next_message,
                language,
                speechRate,
                f"next {number_of_categories_listed_in_one_state} items",
            )

    if total_pages > 1 and state > 0:
        # Previous page.
        prev_message = prev4MessageUrls.get(category)
        if prev_message:
            add_nav_action(
                actions,
                key_to_value_mapping,
                previous_n_categories_key,
                prev_message,
                language,
                speechRate,
                f"previous {number_of_categories_listed_in_one_state} items",
            )

    # Repeat menu.
    add_nav_action(
        actions,
        key_to_value_mapping,
        repeat_current_categories_key,
        repeatCurrentMenuUrl,
        language,
        speechRate,
        "repeatCurrentMenu",
    )

    # Back to previous category level (if not top-level).
    if level != 0 and len(content_attributes) > 1:
        add_nav_action(
            actions,
            key_to_value_mapping,
            previous_category_level_key,
            goToPreviousMenuMessageUrl,
            language,
            speechRate,
            "previous category level",
        )

    options = [
        Option(key=key, value=value) for key, value in key_to_value_mapping.items()
    ]
    menu = Menu(
        description=description, options=options if options else None, level=level
    )

    return {"actions": actions, "menu": menu}


def extract_parent_info(parent_state_id):
    """
    Extracts the parent's block state id and the key chosen from the parent's state id.

    The parent's state id is assumed to contain the last occurrence of "Op" followed by a key
    and then the display value in parentheses. For example:
       "ParentStateOp1(DisplayValue)-"
    This function extracts:
       - parent_block_state_id: the portion before "Op"
       - key_for_option_chosen: the numeric value from the option (plus one)

    Parameters:
      parent_state_id (str): The full parent state id.

    Returns:
      tuple: (parent_block_state_id (str), key_for_option_chosen (int))

    Raises:
      ValueError: if the expected format is not found.
    """
    indexOfLastOp = parent_state_id.rfind("Op")
    if indexOfLastOp == -1:
        raise ValueError("Invalid parent_state_id format: missing 'Op'")
    # Assume a hyphen before "Op" ends the parent block state id.
    parent_block_state_id = parent_state_id[: (indexOfLastOp - 1)]
    # Extract the substring after "Op" up to the trailing hyphen.
    option_chosen = parent_state_id[indexOfLastOp + 2 :][:-1]
    indexOfDigit = option_chosen.find("(")
    if indexOfDigit == -1:
        raise ValueError("Invalid parent_state_id format: missing '(' in option_chosen")
    key_for_option_chosen = int(option_chosen[:indexOfDigit]) + 1
    return parent_block_state_id, key_for_option_chosen


def create_child_state_id(current_page_state_id, option_index, display_value):
    """
    Generates a new child state id based on the current page state id,
    the option index on the page, and the display value chosen.

    The new state id is constructed in the following format:
       {current_page_state_id}-Op{option_index}({display_value})-

    Parameters:
      current_page_state_id (str): The state id of the current page.
      option_index (int): The index (starting at 0) of the option on this page.
      display_value (str): The display value (or key) for this option.

    Returns:
      str: The new child state id.
    """
    return f"{current_page_state_id}-Op{option_index}({display_value})-"


def get_comparable_value(item, key):
    """
    Returns the comparable value from an item for a given key.
    If the item[key] is a dict and contains a 'local' field, return that.
    Otherwise, return the item[key] as is.
    """
    value = item.get(key)
    if isinstance(value, dict) and "local" in value:
        return value["local"]
    return value


def generate_states(
    fsm,
    content_list,
    content_attributes,
    level,
    parent_state_id="",
    parent_selections={},
):
    if level == len(content_attributes):
        filtered_content = [
            item
            for item in content_list
            if all(
                str(get_comparable_value(item, k)).lower() == str(v).lower()
                for k, v in parent_selections.items()
            )
        ]
        if not filtered_content:
            raise ValueError(
                f"No matching content found for selections: {parent_selections}"
            )

        content_data = PureAudioData(**filtered_content[0])
        pure_audio = PureAudio(content_data, speechRate)
        parent_block_state_id, key_for_option_chosen = extract_parent_info(
            parent_state_id
        )
        pure_audio.generate_state(
            fsm, parent_state_id, parent_block_state_id, key_for_option_chosen, level
        )
        return

    filtered_content = [
        item
        for item in content_list
        if all(
            str(get_comparable_value(item, k)).lower() == str(v).lower()
            for k, v in parent_selections.items()
        )
    ]

    current_attr = content_attributes[level]["category"]
    category_id_prefix = content_attributes[level]["id"]

    sorted_categories, values_to_urls, sorted_keys = attribute_handlers[current_attr](
        filtered_content, speechRate, parent_selections
    )
    number_of_states_in_same_level = (
        len(sorted_categories) + number_of_categories_listed_in_one_state - 1
    ) // number_of_categories_listed_in_one_state

    for state_index in range(number_of_states_in_same_level):
        state_id = f"{parent_state_id}{category_id_prefix}{state_index}"
        result = getStreamActions(
            sorted_categories, sorted_keys, level, state_index, parent_selections
        )
        actions = result["actions"]
        menu = result["menu"]
        if level < len(content_attributes):
            actions.append(input_action)
        fsm.add_state(State(state_id=state_id, actions=actions, menu=menu))

        if level > 0 and state_index == 0:
            parent_block_state_id, key_for_option_chosen = extract_parent_info(
                parent_state_id
            )
            fsm.add_transition(
                Transition(
                    source_state_id=parent_block_state_id,
                    dest_state_id=state_id,
                    input=str(key_for_option_chosen),
                    actions=[],
                )
            )

    for state_index in range(number_of_states_in_same_level):
        state_id = f"{parent_state_id}{category_id_prefix}{state_index}"
        if number_of_states_in_same_level > 1:
            if state_index != 0:
                fsm.add_transition(
                    Transition(
                        source_state_id=state_id,
                        dest_state_id=f"{parent_state_id}{category_id_prefix}{state_index - 1}",
                        input=previous_n_categories_key,
                        actions=[],
                    )
                )
            if state_index != number_of_states_in_same_level - 1:
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
        if level != 0 and len(content_attributes) > 1:
            parent_block_state_id, _ = extract_parent_info(parent_state_id)
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
            index_of_item = (
                state_index * number_of_categories_listed_in_one_state
                + index_of_category
            )
            new_selections = parent_selections.copy()
            new_selections[current_attr] = sorted_keys[index_of_item]
            new_state_id = create_child_state_id(
                state_id, index_of_category, sorted_keys[index_of_item]
            )
            if level + 1 <= len(content_attributes):
                generate_states(
                    fsm,
                    content_list,
                    content_attributes,
                    level + 1,
                    new_state_id,
                    new_selections,
                )


async def instantiate_from_latest_content(
    content_ids: Optional[List[str]] = None,
    contents_v3_collection: Optional[MongoDBCollection] = None,
):
    """Instantiate FSM from latest content.

    Args:
        content_ids: Optional list of content IDs to filter
        contents_v3_collection: MongoDB collection for contentsV3. If None, will use app state.

    Returns:
        FSM instance
    """
    # Get collection from app state if not provided
    if contents_v3_collection is None:
        from app.core.state import get_app_state

        contents_v3_collection = get_app_state().contents_v3_mongo

    content = await contents_v3_collection.find_all()

    fsm = FSM(fsm_id=str(uuid.uuid4()))
    fsm.set_end_state(
        State(
            state_id="END",
            actions=[
                TalkAction(
                    text="You didn't choose a valid option. Bye bye.", bargeIn=False
                )
            ],
        )
    )
    parent_selections = {}
    generate_states(
        fsm, content, content_attributes, 0, parent_selections=parent_selections
    )

    print("NUMBER OF CONTENT", len(content))

    with open("../fsm-visual-refactored.txt", "w", encoding="utf-8") as file:
        file.write(fsm.visualize_fsm())

    fsm.print_states()
    return fsm


def instantitate_from_doc(data: IVRfsmDoc):
    return FSM.deserialize(data)


# if __name__ == "__main__":
#     import asyncio
#     fsm = asyncio.run(instantiate_from_latest_content())
