from __future__ import annotations

from app.aggregators.html_to_markdown import html_to_markdown, markdown_to_html


def test_html_to_markdown_converts_basic_tags():
    md = html_to_markdown("<p><strong>Hello</strong> world</p>")
    assert "**Hello**" in md
    assert "world" in md


def test_markdown_to_html_round_trip():
    html = markdown_to_html("**Hello** world")
    assert "<strong>Hello</strong>" in html
    assert "world" in html
