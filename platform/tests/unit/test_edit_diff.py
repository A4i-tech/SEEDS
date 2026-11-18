from __future__ import annotations

from app.remediation.edit_diff import edit_diff_pairs


def _pair(wrong: str, right: str) -> dict[str, str]:
    return {"wrong": wrong, "right": right}


def test_word_swap_in_a_line_is_a_pair():
    assert edit_diff_pairs("এই কপা ছোট\nশেষ", "এই কণা ছোট\nশেষ") == [_pair("কপা", "কণা")]


def test_inserted_and_deleted_words_are_not_pairs():
    assert edit_diff_pairs("a b c", "a b c d") == []
    assert edit_diff_pairs("a b c", "a c") == []


def test_added_or_removed_lines_pair_nothing():
    assert edit_diff_pairs("one\ntwo", "one\nextra\nthree") == []


def test_long_rewrite_is_not_a_pair():
    assert edit_diff_pairs("a b c d e f", "x y z w v u") == []


def test_markup_only_change_is_not_a_pair():
    assert edit_diff_pairs("word ---", "word ***") == []


def test_two_swaps_in_one_line():
    assert edit_diff_pairs("aa mid bb", "xx mid yy") == [_pair("aa", "xx"), _pair("bb", "yy")]


def test_markdown_style_change_is_not_a_pair():
    assert edit_diff_pairs("make **bold** here", "make bold here") == []
