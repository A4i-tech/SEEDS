from __future__ import annotations

import pytest

pytest.importorskip("omni_ingest", reason="optional `remediation` dependency group")

from app.remediation.postcorrect import Edit, _gate, chunk, mechanical, verify  # noqa: E402
from app.remediation.write_markdown import order_pages  # noqa: E402

_EDIT = Edit(
    type="wrong_matra",
    wrong="कीमया",
    correct="किमया",
    context_before="यह ",
    context_after=" है",
    confidence=0.99,
    decision="auto_apply",
)
_UNIT = "यह कीमया है"


def test_gate_passes_a_calibrated_class_a_edit():
    assert _gate(_UNIT, _EDIT, 0, "devanagari", 0.97, 0.5)[0] == "pass"


@pytest.mark.parametrize(
    ("update", "script", "min_confidence", "max_delta", "expected"),
    [
        ({}, "tamil", 0.97, 0.5, "script_uncalibrated"),
        ({}, "devanagari", 0.995, 0.5, "confidence"),
        ({"decision": "review"}, "devanagari", 0.97, 0.5, "decision"),
        ({"type": "wrong_word"}, "devanagari", 0.97, 0.5, "class"),
        ({"context_before": "nope "}, "devanagari", 0.97, 0.5, "anchoring"),
        ({"correct": "किमयाा"}, "devanagari", 0.97, 0.01, "budget"),
    ],
)
def test_gate_blocks(update, script, min_confidence, max_delta, expected):
    edit = _EDIT.model_copy(update=update) if update else _EDIT
    assert _gate(_UNIT, edit, 0, script, min_confidence, max_delta)[0] == expected


def test_gate_blocks_beautification():
    edit = Edit(type="wrong_glyph", wrong="Fe_3O_4", correct="Fe3O4", confidence=0.99, decision="auto_apply")
    assert _gate("see Fe_3O_4 here", edit, 0, "devanagari", 0.97, 0.5)[0] == "beautification"


def test_gate_blocks_an_edit_inside_a_protected_span():
    edit = Edit(
        type="wrong_glyph",
        wrong="fig",
        correct="figure",
        context_before="![",
        context_after="](a.png)",
        confidence=0.99,
        decision="auto_apply",
    )
    assert _gate("![fig](a.png)", edit, 0, "devanagari", 0.97, 0.5)[0] == "protected_span"


def test_mechanical_repairs_line_endings_and_latex_backslashes():
    assert mechanical("a\r\nbegin{x}")[0] == "a\n\\begin{x}"


def test_mechanical_leaves_prose_that_looks_like_a_command_alone():
    assert mechanical("![the end of it](a.png)")[0] == "![the end of it](a.png)"


def test_chunk_splits_on_blank_lines():
    assert len(chunk("| a | b |\n| - | - |\n\n" + "x" * 4000, 3500)) == 2


def test_verify_rejects_a_changed_digit():
    assert verify("2 mL", "3 mL", 0.5) == "digits changed"


def test_verify_accepts_an_equal_length_letter_change():
    assert verify("hi", "ho", 0.5) is None


def test_order_pages_sorts():
    assert order_pages([3, 1, 2]) == [1, 2, 3]
    assert order_pages([7]) == [7]


@pytest.mark.parametrize(
    ("pages", "reason"),
    [([], "No pages"), ([1, 3], "missing"), ([1, 1], "Duplicate")],
)
def test_order_pages_refuses_a_run_with_a_hole_in_it(pages, reason):
    with pytest.raises(ValueError, match=reason):
        order_pages(pages)


from app.remediation.alt_translate import alt_spans, replace_alts  # noqa: E402
from app.remediation.remediate import (  # noqa: E402
    fix_heading_levels,
    inline_unresolved_images,
    strip_furniture,
    table_blocks,
)

_MD = "before ![a diagram](fig1.png) after\n\n![](fig2.png)\n"


def test_alt_spans_skips_an_image_with_no_alt_text():
    assert [(alt, src) for _, _, alt, src in alt_spans(_MD)] == [("a diagram", "fig1.png")]


def test_replace_alts_leaves_src_and_surrounding_text_byte_identical():
    out = replace_alts(_MD, alt_spans(_MD), ["ಒಂದು ಚಿತ್ರ"])
    assert out == "before ![ಒಂದು ಚಿತ್ರ](fig1.png) after\n\n![](fig2.png)\n"


def test_replace_alts_refuses_a_length_mismatch():
    with pytest.raises(ValueError, match="1 translations for 0 images"):
        replace_alts("no images", [], ["stray"])


@pytest.mark.parametrize(
    ("line", "rule"),
    [("42", "page_number"), ("  xiv ", "roman_page_number"),
     ("https://example.com/x", "bare_url"), ("Scan the QR code below.", "qr_caption")],
)
def test_strip_furniture_removes_standalone_furniture(line, rule):
    text, removed = strip_furniture(f"Keep me.\n{line}\nKeep me too.")
    assert text == "Keep me.\nKeep me too."
    assert removed[0]["rule"] == rule


@pytest.mark.parametrize(
    "line",
    ["There were 42 students.", "See https://example.com/x for more.", "A QR code links to the video, and the page continues past sixty characters of text."],
)
def test_strip_furniture_leaves_a_lookalike_inside_a_sentence_alone(line):
    text, removed = strip_furniture(line)
    assert (text, removed) == (line, [])


def test_fix_heading_levels_promotes_the_first_heading_and_collapses_skips():
    text, changes = fix_heading_levels("## Chapter\n\n#### Section\n\nbody\n\n##### Detail")
    assert text.split("\n\n") == ["# Chapter", "## Section", "body", "### Detail"]
    assert [c["after"] for c in changes] == [1, 2, 3]


def test_fix_heading_levels_leaves_a_well_formed_document_alone():
    text = "# A\n\n## B\n\n### C\n\n## D"
    assert fix_heading_levels(text) == (text, [])


def test_table_blocks_finds_a_table_and_ignores_a_pipe_in_prose():
    text = "intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nuse a | b for or\n"
    assert table_blocks(text) == [(2, 4)]


def test_inline_unresolved_images_keeps_a_resolvable_src(tmp_path):
    (tmp_path / "fig1.png").write_bytes(b"x")
    out, records, resolved = inline_unresolved_images("![a diagram](fig1.png)", tmp_path)
    assert out == "![a diagram](fig1.png)"
    assert (records, resolved) == ([], 1)


def test_inline_unresolved_images_surfaces_alt_text_rather_than_losing_it(tmp_path):
    out, records, resolved = inline_unresolved_images(_MD, tmp_path)
    assert "**Figure.** a diagram" in out
    assert "**Figure.** (no description available)" in out
    assert (len(records), resolved) == (2, 0)
