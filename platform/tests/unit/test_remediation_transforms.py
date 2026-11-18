from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("omni_ingest")
jq = pytest.importorskip("jq")
yaml = pytest.importorskip("yaml")

PIPELINE = Path(__file__).parents[2] / "app" / "remediation" / "textbook_remediation.yaml"


def _expr(description: str) -> str:
    steps = yaml.safe_load(PIPELINE.read_text(encoding="utf-8"))["steps"]
    matches = [s for s in steps if s.get("description") == description]
    assert len(matches) == 1, f"Expected exactly one pipeline step described '{description}', found {len(matches)}."
    return matches[0]["config"]["value"]


def _run(description: str, doc: dict) -> dict:
    return jq.compile(_expr(description)).input_value(doc).first()


def _text_items(*texts):
    return {"metadata": {}, "items": [{"id": str(i), "text": t, "metadata": {}} for i, t in enumerate(texts)]}


def _repeat(*texts):
    return [i["text"] for i in _run("Remove print-artifact lines from OCR text", _text_items(*texts))["items"]]


def test_repeat_lines_removed():
    text = "Body one\n0920CH01\nReprint 2025-26\nbook.indd 12\nBody two"
    assert _repeat(text) == ["Body one\nBody two"]


def test_repeat_lines_keep_real_text():
    text = "Chapter 1 CH4 is gas\nReprint of the poem 2025\nindexed items\nকপার সালফেট"
    assert _repeat(text) == [text]


def test_short_indd_line_removed():
    assert _repeat("Body\nPreliminaryT-III TM.indd 1\nEnd") == ["Body\nEnd"]


def test_long_sentence_with_indd_kept():
    text = "The designer exported the final layout of this chapter to a file named Chapter_Final_Layout_v2.indd for printing."
    assert _repeat(text) == [text]


def test_long_sentence_with_chapter_code_kept():
    text = "Students can find the full exercise for this unit in the file coded 0920CH01 at the end of the book."
    assert _repeat(text) == [text]


def test_repeat_lines_skip_null_text():
    doc = {"metadata": {}, "items": [{"id": "i", "text": None, "metadata": {}}]}
    assert _run("Remove print-artifact lines from OCR text", doc) == doc


def _digit(text, markdown, kind="page"):
    doc = {"metadata": {}, "items": [{"id": "a", "text": text, "metadata": {"kind": kind, "verified": {"markdown": markdown}}}]}
    out = _run("Restore Western digits the OCR verification turned into Bengali digits", doc)
    return out["items"][0]["metadata"]["verified"]["markdown"]


def test_digit_guard_converts_when_source_has_no_bengali_digit():
    assert _digit("Class 10 page 25", "Class ১০ page ২৫") == "Class 10 page 25"


def test_digit_guard_keeps_when_source_has_bengali_digit():
    assert _digit("পাতা ২৫", "পাতা ২৫") == "পাতা ২৫"


def test_digit_guard_keeps_bengali_digits_when_ocr_read_no_digit_at_all():
    assert _digit("পাতা", "পাতা ২৫") == "পাতা ২৫"


def test_digit_guard_skips_items_with_no_text_or_no_verified_markdown():
    doc = {
        "metadata": {},
        "items": [
            {"id": "a", "text": None, "metadata": {"kind": "page", "verified": {"markdown": "১০"}}},
            {"id": "b", "text": "Class 10", "metadata": {"kind": "page"}},
        ],
    }
    assert _run("Restore Western digits the OCR verification turned into Bengali digits", doc) == doc


def test_digit_guard_skips_image_items():
    assert _digit("x", "১০", kind="image") == "১০"


def _blocks(*blocks):
    doc = {"metadata": {}, "items": [{"id": "a", "text": "t", "metadata": {"remediation": {"blocks": list(blocks)}}}]}
    out = _run("Fix known markdown faults in the rebuilt block tree", doc)
    return out["items"][0]["metadata"]["remediation"]["blocks"]


def _para(text):
    return {"type": "paragraph", "text": text}


def _list(*items):
    return {"type": "list", "text": "", "items": list(items)}


@pytest.mark.parametrize("text", ["5", "?", " 7 ", "৫"])
def test_stray_paragraph_removed(text):
    assert _blocks(_para(text)) == []


@pytest.mark.parametrize("text", ["5 apples are red", "What?", "12", "কপার সালফেট"])
def test_real_paragraph_kept(text):
    assert _blocks(_para(text)) == [_para(text)]


def test_bullet_after_list_marker_stripped():
    assert _blocks(_list("1. • first", "- • second"))[0]["items"] == ["1. first", "- second"]
    assert _blocks(_para("1. • first"))[0]["text"] == "1. first"


def test_bullet_without_marker_kept():
    assert _blocks(_para("• first"))[0]["text"] == "• first"


def test_empty_list_removed():
    assert _blocks(_list("", ""), _para("keep")) == [_para("keep")]


def test_real_list_kept():
    block = _list("1. first", "")
    assert _blocks(block) == [block]


def test_doubled_number_collapsed():
    assert _blocks(_list("1. 1) first", "2. 6. second"))[0]["items"] == ["1) first", "6. second"]
    assert _blocks(_para("3. 3) What is salt?"))[0]["text"] == "3) What is salt?"


def test_real_numbering_kept():
    block = _list("1. first", "2. 5.5 kg of salt", "3. 10 apples")
    assert _blocks(block) == [block]
    assert _blocks(_para("1. কপার সালফেট")) == [_para("1. কপার সালফেট")]


def test_latex_subscript_rewritten():
    assert _blocks(_para("Fe_{3}O_{4} and SO_{4}^{2-} and H_{2}O"))[0]["text"] == "Fe₃O₄ and SO₄^{2-} and H₂O"


def test_non_subscript_text_kept():
    assert _blocks(_para("snake_case and a_{b}"))[0]["text"] == "snake_case and a_{b}"
