from __future__ import annotations

import re

import pytest

from app.platform.error_handling import ValidationError
from app.models.remediation_job import JobStatus, RemediationJob
from app.remediation.braille import build_braille, markdown_to_braille_text, validate_braille_job

MARKDOWN = """# Chapter 1

| Name | Age |
|------|-----|
| Ravi | 10 |

<math><mi>x</mi></math>
<!-- spoken: x squared -->

<math><mi>y</mi></math>

![A cat](images/a.jpg)

![](images/b.jpg)
"""


def _types(warnings):
    return {w.type for w in warnings}


def _job(**fields):
    base = {"_id": "1", "tenant_id": "t", "source_name": "b.pdf", "source_url": "u", "language": "kn", "status": JobStatus.VERIFIED, "stage": None}
    return RemediationJob.from_doc({**base, **fields})


def test_preprocess_flattens_structure_and_counts_review_items():
    text, counts, warnings = markdown_to_braille_text(MARKDOWN)

    assert "Name: Ravi; Age: 10" in text
    assert "x squared" in text
    assert "[Equation missing]" in text
    assert "[Image: A cat]" in text
    assert "[Image: no description]" in text
    assert "|" not in text and "<" not in text
    assert counts.model_dump() == {"equations": 2, "tables": 1, "images_without_alt": 1}
    assert _types(warnings) == {"equation", "table", "image"}


def test_raw_html_is_reported_as_left_out_but_autolinks_and_comments_are_not():
    _, _, warnings = markdown_to_braille_text("Hello <blink>there</blink>")
    assert "html" in _types(warnings)

    _, _, warnings = markdown_to_braille_text("See <https://example.org> <!-- note -->")
    assert "html" not in _types(warnings)


def test_currency_is_not_counted_as_an_equation():
    _, counts, _ = markdown_to_braille_text("It costs $5 and then $6.")

    assert counts.equations == 0


def test_html_table_with_header_rows_footer_and_caption_is_flattened_and_counted():
    html = (
        "<table><caption>Marks</caption>"
        "<thead><tr><th>Name</th><th>Score</th></tr><tr><th>(all)</th><th>(out of 10)</th></tr></thead>"
        "<tbody><tr><td>Ravi</td><td>9</td></tr></tbody>"
        "<tfoot><tr><td>Total</td><td>9</td></tr></tfoot></table>"
    )

    text, counts, warnings = markdown_to_braille_text(html)

    assert counts.tables == 1
    assert "table" in _types(warnings)
    assert "Marks" in text
    assert "Name: (all); Score: (out of 10)" in text
    assert "Name: Ravi; Score: 9" in text
    assert "Name: Total; Score: 9" in text


def test_grid_table_is_counted():
    grid = "+------+-----+\n| Name | Age |\n+======+=====+\n| Ravi | 10  |\n+------+-----+\n"

    _, counts, _ = markdown_to_braille_text(grid)

    assert counts.tables == 1


def test_validate_braille_job_rejects_unverified_and_unsupported_language():
    assert validate_braille_job(_job()) == "kn"
    with pytest.raises(ValidationError, match="verified"):
        validate_braille_job(_job(status=JobStatus.IN_REVIEW))
    with pytest.raises(ValidationError, match="not available for language 'bn'"):
        validate_braille_job(_job(language="bn"))



def _cell_lines(brf):
    return [line for page in brf.split("\f") for line in page.split("\r\n")]


def test_build_braille_pages_fit_braille_cells():
    brf, report = build_braille("word " * 400, "en")

    assert all(len(line) <= 40 for line in _cell_lines(brf))
    assert all(len(page.split("\r\n")) <= 25 for page in brf.split("\f"))
    assert report.needs_review is False


def test_build_braille_supports_a_non_english_table():
    brf, report = build_braille("नमस्ते", "hi")

    assert report.table == "hi-in-g1.utb"
    assert brf.strip()


def test_unmapped_characters_warn_and_count_as_one_cell_when_wrapping():
    brf, report = build_braille("中 " * 60, "en")

    assert "character" in _types(report.warnings)
    assert report.needs_review is True
    assert all(len(re.sub(r"\\X[0-9A-F]{4}", "?", line)) <= 40 for line in _cell_lines(brf))
