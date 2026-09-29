from __future__ import annotations

import pytest

from app.platform.error_handling import ValidationError
from app.remediation.braille import build_braille, markdown_to_braille_text

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


def test_preprocess_flattens_structure_and_counts_review_items():
    text, counts, warnings = markdown_to_braille_text(MARKDOWN)

    assert "Name: Ravi; Age: 10" in text
    assert "x squared" in text
    assert "[Equation missing]" in text
    assert "[Image: A cat]" in text
    assert "|" not in text and "<" not in text
    assert counts == {"equations": 2, "tables": 1, "images_without_alt": 1}
    assert {w["type"] for w in warnings} == {"equation", "table", "image"}


def test_unsupported_language_fails_loudly():
    with pytest.raises(ValidationError, match="not available for language 'bn'"):
        build_braille(MARKDOWN, "bn")


def test_build_braille_pages_fit_braille_cells():
    pytest.importorskip("louis")

    brf, report = build_braille("word " * 400, "en")

    assert all(len(line) <= 40 for page in brf.split("\f") for line in page.split("\r\n"))
    assert all(len(page.split("\r\n")) <= 25 for page in brf.split("\f"))
    assert report["needs_review"] is False
