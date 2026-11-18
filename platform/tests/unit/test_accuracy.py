from __future__ import annotations

from app.remediation.accuracy import readable_text, score_edit


def test_markup_does_not_count_as_matching_text():
    md = "<!-- page 1 -->\n\n![Alt words](images/a.jpg)\n\n| a | b |\n| --- | --- |\n| 1 | 2 |"
    assert readable_text(md) == "Alt words a b 1 2"
    assert readable_text("**bold** and `code` <math><mn>5</mn></math>") == "bold and code 5"


def test_scores_page_by_page_and_adds_up():
    before = "<!-- page 1 -->\n\nabcdefghij\n\n<!-- page 2 -->\n\nklmnopqrst"
    after = "<!-- page 1 -->\n\nabcdefghij\n\n<!-- page 2 -->\n\nXXXXXXXXXX"
    score = score_edit(before, after)
    assert [(p["page"], p["distance"], p["length"]) for p in score["pages"]] == [("1", 0, 10), ("2", 10, 10)]
    assert score["percent"] == 50.0


def test_a_deleted_page_is_scored_as_changed_text():
    before = "<!-- page 1 -->\n\nabcde\n\n<!-- page 2 -->\n\nfghij"
    after = "<!-- page 1 -->\n\nabcde"
    assert score_edit(before, after)["percent"] == 45.5


def test_a_lost_page_marker_with_no_text_change_is_still_100_percent():
    before = "<!-- page 1 -->\n\nAAAA\n\n<!-- page 2 -->\n\nBBBB"
    after = "<!-- page 1 -->\n\nAAAA\n\nBBBB"
    assert score_edit(before, after)["percent"] == 100.0


def test_indic_text_is_scored_by_characters():
    assert score_edit("এই কপা ছোট", "এই কণা ছোট")["distance"] == 1


def test_empty_text_is_100_percent_with_zero_length():
    assert score_edit("", "")["length"] == 0
    assert score_edit("", "")["percent"] == 100.0
