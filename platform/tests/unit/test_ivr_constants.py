from __future__ import annotations


def test_page_size_is_seven() -> None:
    from app.services.fsm.instantiation.ivr_constants import (
        number_of_categories_listed_in_one_state,
    )

    assert number_of_categories_listed_in_one_state == 7


def test_pagination_keys_are_star_and_hash() -> None:
    from app.services.fsm.instantiation.ivr_constants import (
        next_n_categories_key,
        previous_n_categories_key,
    )

    assert next_n_categories_key == "#"
    assert previous_n_categories_key == "*"


def test_previous_category_level_key_unchanged() -> None:
    from app.services.fsm.instantiation.ivr_constants import (
        previous_category_level_key,
    )

    assert previous_category_level_key == "9"


def test_repeat_key_constant_is_eight() -> None:
    from app.services.fsm.instantiation.ivr_constants import (
        repeat_current_categories_key,
    )

    assert repeat_current_categories_key == "8"
