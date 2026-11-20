from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.translation_rules import find_exclusion, find_override

NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _excl(text):
    return {"kind": "exclusion", "text": text, "lang": "", "translation": "", "updated_at": NOW}


def _over(text, translation, lang="hi", age=0):
    return {
        "kind": "override",
        "text": text,
        "lang": lang,
        "translation": translation,
        "updated_at": NOW - timedelta(minutes=age),
    }


def test_exclusion_matches_whole_text_only():
    rules = [_excl(r"\frac{*}{*}")]
    assert find_exclusion(rules, r"\frac{1}{2}") is rules[0]
    assert find_exclusion(rules, r"x \frac{1}{2}") is None


def test_question_mark_matches_one_character():
    rules = [_excl("Grade ?")]
    assert find_exclusion(rules, "Grade 5") is rules[0]
    assert find_exclusion(rules, "Grade 10") is None


def test_regex_characters_are_literal():
    rules = [_excl("a.b(c)[d]+")]
    assert find_exclusion(rules, "a.b(c)[d]+") is rules[0]
    assert find_exclusion(rules, "aXb(c)[d]+") is None


def test_star_spans_line_breaks():
    assert find_exclusion([_excl("a*b")], "a\nline\nb") is not None


def test_matching_is_case_sensitive():
    assert find_exclusion([_excl("Dates")], "dates") is None


def test_override_ignores_other_language_and_kind():
    rules = [_excl("Dates"), _over("Dates", "tarikh", lang="mr")]
    assert find_override(rules, "Dates", "hi") is None


def test_override_exact_beats_pattern():
    exact, pattern = _over("Dates", "exact"), _over("Da*", "pattern")
    assert find_override([pattern, exact], "Dates", "hi") is exact


def test_override_longer_literal_wins():
    short, long_ = _over("D*", "short"), _over("Dat*", "long")
    assert find_override([short, long_], "Dates", "hi") is long_


def test_override_newest_breaks_ties():
    old, new = _over("D*", "old", age=5), _over("*s", "new", age=0)
    assert find_override([old, new], "Dates", "hi") is new
