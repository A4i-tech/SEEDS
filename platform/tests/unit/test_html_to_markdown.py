from __future__ import annotations

from app.aggregators.html_to_markdown import html_to_markdown, markdown_to_html


def test_html_to_markdown_converts_basic_tags():
    md = html_to_markdown("<p><strong>Hello</strong> world</p>")
    assert "**Hello**" in md
    assert "world" in md


def test_html_to_markdown_strips_mso_span_artifacts():
    html = '<p>Hello <span lang="EN-US" style="mso-fareast-font-family:Georgia">world</span> test</p>'
    md = html_to_markdown(html)
    assert md.strip() == "Hello world test"
    assert "{" not in md
    assert "<span" not in md


def test_html_to_markdown_uses_gfm_pipe_tables():
    html = "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>"
    md = html_to_markdown(html)
    assert "| A" in md
    assert "|---" in md.replace(" ", "") or "| --- " in md


def test_html_to_markdown_drops_dangling_hard_break_after_image():
    html = '<p><img src="https://example.com/f1.jpg"><br></p><p>Next paragraph.</p>'
    md = html_to_markdown(html)
    assert "\\\n" not in md
    assert "![](https://example.com/f1.jpg)" in md


def test_html_to_markdown_drops_dangling_hard_break_at_end_of_document():
    html = '<p>Some intro text.</p><p><img src="https://example.com/4.4.JPG"><br></p>'
    md = html_to_markdown(html)
    assert not md.rstrip().endswith("\\")
    assert "![](https://example.com/4.4.JPG)" in md


def test_markdown_to_html_round_trip():
    html = markdown_to_html("**Hello** world")
    assert "<strong>Hello</strong>" in html
    assert "world" in html
