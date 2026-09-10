from __future__ import annotations

import pytest

pytest.importorskip("omni_ingest", reason="optional `remediation` dependency group")

from app.remediation.postcorrect import Edit, _gate, chunk, mechanical, verify  # noqa: E402

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




from app.remediation.remediate import (  # noqa: E402
    fix_heading_levels,
    inline_unresolved_images,
    strip_furniture,
    table_blocks,
)


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


_MD = "before ![a diagram](fig1.png) after\n\n![](fig2.png)\n"


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


from app.remediation.detect_language import detect_language  # noqa: E402


def test_detect_language_identifies_indic_scripts():
    hindi_sample = "कबीर के दोहे बहुत प्रसिद्ध हैं। यह पाठ कक्षा 10 के लिए है।" * 5
    assert detect_language(hindi_sample) == "Hindi"

    tamil_sample = "தமிழ்நாடு அரசு பாடநூல் மற்றும் கல்வியியல் பணிகள் கழகம்" * 5
    assert detect_language(tamil_sample) == "Tamil"

    kannada_sample = "ಕರ್ನಾಟಕ ಸರ್ಕಾರ ಸಾರ್ವಜನಿಕ ಶಿಕ್ಷಣ ಇಲಾಖೆ" * 5
    assert detect_language(kannada_sample) == "Kannada"


def test_detect_language_identifies_english():
    english_sample = "Chapter 1: Nutrition in Plants. All living organisms require food."
    assert detect_language(english_sample) == "English"


def test_detect_language_handles_empty_or_whitespace():
    assert detect_language("") == "English"
    assert detect_language("   \n\t  ") == "English"


from app.remediation.render import render_remediation  # noqa: E402


def test_render_remediation_generates_all_artifacts(tmp_path):
    ctx = {
        "items": [
            {
                "id": "page-1",
                "content": "# Raw Heading\n\nSome text on page 1",
                "metadata": {
                    "kind": "page",
                    "page": 1,
                    "remediation": {
                        "blocks": [
                            {"type": "heading", "level": 1, "text": "Clean Heading"},
                            {"type": "paragraph", "text": "Accessible paragraph text"},
                            {"type": "figure", "image_id": "img-1", "text": ""},
                            {"type": "table", "header": ["Col A", "Col B"], "rows": [["1", "2"]]},
                        ],
                        "removed_artifacts": [{"kind": "page_number", "value": "1"}],
                    },
                    "verified": {
                        "corrections": [{"found": "teh", "corrected": "the", "fault": "other", "certain": True}],
                    },
                },
            },
            {
                "id": "img-1",
                "content": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "metadata": {
                    "kind": "image",
                    "page": 1,
                    "accessibility": {
                        "kind": "diagram",
                        "alt_text": "A simple pixel diagram",
                        "long_description": "Full explanation of the diagram.",
                        "observed_result": "Shows test diagram output",
                        "review_needed": False,
                    },
                },
            },
        ]
    }

    out_dir = tmp_path / "artifacts"
    res = render_remediation(ctx, out_dir)

    assert (out_dir / "raw.md").exists()
    assert (out_dir / "raw.corrected.remediated.md").exists()
    assert (out_dir / "raw.findings.jsonl").exists()
    assert (out_dir / "raw.alt.jsonl").exists()
    assert (out_dir / "raw.corrected.remediation.jsonl").exists()
    assert (out_dir / "remediated.unresolved.jsonl").exists()
    assert (out_dir / "remediated.docx").exists()

    md_content = (out_dir / "raw.corrected.remediated.md").read_text(encoding="utf-8")
    assert "# Clean Heading" in md_content
    assert "![A simple pixel diagram](images/" in md_content
    assert "| Col A | Col B |" in md_content

    assert res["pages"] == 1
    assert res["figures"] == 1
    assert res["findings"] == 1

