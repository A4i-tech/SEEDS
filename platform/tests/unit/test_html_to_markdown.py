from __future__ import annotations

from app.aggregators.html_to_markdown import (
    _DANGLING_HARD_BREAK,
    html_to_markdown,
    markdown_to_html,
)


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


def test_html_to_markdown_flattens_multi_paragraph_table_cells():
    html = (
        "<table><tr><th>Col A</th><th>Col B</th></tr>"
        "<tr><td><p>Line one</p><p>Line two</p></td><td>simple</td></tr></table>"
    )
    md = html_to_markdown(html)
    assert "[TABLE]" not in md
    assert "Line one Line two" in md
    assert "simple" in md


def test_html_to_markdown_inlines_lists_inside_table_cells():
    html = "<table><tr><th>A</th></tr><tr><td><ol><li>one</li><li>two</li></ol></td></tr></table>"
    md = html_to_markdown(html)
    assert "[TABLE]" not in md
    assert "one; two" in md


def test_html_to_markdown_preserves_math_inside_table_cells():
    html = (
        "<table><tr><th>Formula</th></tr>"
        '<tr><td><p><math xmlns="http://www.w3.org/1998/Math/MathML">'
        "<msqrt><mn>2</mn></msqrt></math></p></td></tr></table>"
    )
    md = html_to_markdown(html)
    assert "[TABLE]" not in md
    assert "sqrt" in md.lower()


def test_dangling_hard_break_stripped_before_closing_math_delimiter():
    broken = "5^{2} - {(" + chr(92) + "sqrt{3})}^{2}}" + chr(92) + "`$*\r"
    cleaned = _DANGLING_HARD_BREAK.sub("", broken)
    assert cleaned == "5^{2} - {(" + chr(92) + "sqrt{3})}^{2}}`$*\r"
    assert not cleaned.rstrip("*\r").endswith(chr(92))


def test_markdown_to_html_round_trip():
    html = markdown_to_html("**Hello** world")
    assert "<strong>Hello</strong>" in html
    assert "world" in html
