from __future__ import annotations


def _make_theme_items(count: int) -> tuple[list[str], list[str]]:
    urls = [f"http://example.com/theme{i}.mp3" for i in range(count)]
    keys = [f"Theme{i}" for i in range(count)]
    return urls, keys


class TestPageSizeSeven:
    def test_seven_items_no_pagination_keys(self) -> None:
        from app.services.fsm.instantiation.insti import _get_stream_actions

        urls, keys = _make_theme_items(7)
        result = _get_stream_actions(urls, keys, level=1, state=0, parent_selections={"language": "en"})

        option_keys = {o.key for o in result["menu"].options}
        assert "#" not in option_keys, "no next-page key when everything fits on one page"
        assert "*" not in option_keys, "no prev-page key on the only page"

    def test_seventh_item_maps_to_content_not_nav(self) -> None:
        from app.services.fsm.instantiation.insti import _get_stream_actions

        urls, keys = _make_theme_items(7)
        result = _get_stream_actions(urls, keys, level=1, state=0, parent_selections={"language": "en"})

        option_by_key = {o.key: o.value for o in result["menu"].options}
        assert option_by_key["7"] == "Theme6", "key 7 must select the 7th item, not trigger repeat"

    def test_eight_items_first_page_has_next_only(self) -> None:
        from app.services.fsm.instantiation.insti import _get_stream_actions

        urls, keys = _make_theme_items(8)
        result = _get_stream_actions(urls, keys, level=1, state=0, parent_selections={"language": "en"})

        option_keys = {o.key for o in result["menu"].options}
        assert "#" in option_keys, "next-page key must appear when a second page exists"
        assert "*" not in option_keys, "no prev-page key on the first page"

    def test_eight_items_second_page_has_prev_only(self) -> None:
        from app.services.fsm.instantiation.insti import _get_stream_actions

        urls, keys = _make_theme_items(8)
        result = _get_stream_actions(urls, keys, level=1, state=1, parent_selections={"language": "en"})

        option_keys = {o.key for o in result["menu"].options}
        assert "*" in option_keys, "prev-page key must appear on the second page"
        assert "#" not in option_keys, "no next-page key past the last page"
        option_by_key = {o.key: o.value for o in result["menu"].options}
        assert option_by_key["1"] == "Theme7"


class TestRepeatKeyKept:
    def test_repeat_option_in_menu_on_key_eight(self) -> None:
        from app.services.fsm.instantiation.insti import _get_stream_actions

        urls, keys = _make_theme_items(3)
        result = _get_stream_actions(urls, keys, level=1, state=0, parent_selections={"language": "en"})

        option_by_key = {o.key: o.value for o in result["menu"].options}
        assert option_by_key["8"] == "repeatCurrentMenu"

    def test_back_a_level_key_still_present(self) -> None:
        from app.services.fsm.instantiation.insti import _get_stream_actions

        urls, keys = _make_theme_items(3)
        result = _get_stream_actions(urls, keys, level=1, state=0, parent_selections={"language": "en"})

        option_by_key = {o.key: o.value for o in result["menu"].options}
        assert option_by_key["9"] == "previous category level"
