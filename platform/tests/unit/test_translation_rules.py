from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.translation_rules import (
    RuleSet,
    find_exclusion,
    find_override,
    needs_generation,
    served_text,
)

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
    assert find_exclusion(RuleSet(rules), r"\frac{1}{2}") is rules[0]
    assert find_exclusion(RuleSet(rules), r"x \frac{1}{2}") is None


def test_question_mark_matches_one_character():
    rules = [_excl("Grade ?")]
    assert find_exclusion(RuleSet(rules), "Grade 5") is rules[0]
    assert find_exclusion(RuleSet(rules), "Grade 10") is None


def test_regex_characters_are_literal():
    rules = [_excl("a.b(c)[d]+")]
    assert find_exclusion(RuleSet(rules), "a.b(c)[d]+") is rules[0]
    assert find_exclusion(RuleSet(rules), "aXb(c)[d]+") is None


def test_star_spans_line_breaks():
    assert find_exclusion(RuleSet([_excl("a*b")]), "a\nline\nb") is not None


def test_matching_is_case_sensitive():
    assert find_exclusion(RuleSet([_excl("Dates")]), "dates") is None


def test_override_ignores_other_language_and_kind():
    rules = [_excl("Dates"), _over("Dates", "tarikh", lang="mr")]
    assert find_override(RuleSet(rules), "Dates", "hi") is None


def test_override_exact_beats_pattern():
    exact, pattern = _over("Dates", "exact"), _over("Da*", "pattern")
    assert find_override(RuleSet([pattern, exact]), "Dates", "hi") is exact


def test_override_longer_literal_wins():
    short, long_ = _over("D*", "short"), _over("Dat*", "long")
    assert find_override(RuleSet([short, long_]), "Dates", "hi") is long_


def test_override_newest_breaks_ties():
    old, new = _over("D*", "old", age=5), _over("*s", "new", age=0)
    assert find_override(RuleSet([old, new]), "Dates", "hi") is new


def test_many_stars_finish_fast():
    assert find_exclusion(RuleSet([_excl("*a*a*a*a*b")]), "a" * 5000) is None


def test_nothing_stored_needs_generation_but_an_empty_source_with_a_draft_does_not():
    assert needs_generation(RuleSet([]), {"source_text": "x", "translations": {}}, "hi")
    doc = {"source_text": "", "translations": {"hi": {"text": "pending", "status": "pending"}}}
    assert not needs_generation(RuleSet([]), doc, "hi")
    assert served_text(RuleSet([]), doc, "hi", False) == ""
