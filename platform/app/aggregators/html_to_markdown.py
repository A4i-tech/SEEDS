from __future__ import annotations

import re

import pypandoc
from bs4 import BeautifulSoup

_MARKDOWN_TARGET = "gfm-raw_html-bracketed_spans-raw_attribute"

_DANGLING_HARD_BREAK = re.compile(r"\\(?=\r?\n\r?\n|\r?\n?$|`\$)")

_BACKTICK_MATH_RE = re.compile(r"\$`([^`]+)`\$")

_CELL_PARAGRAPH_TAGS = ("p", "div")


def _inline_list(list_tag) -> None:
    items = list_tag.find_all("li", recursive=False)
    children = []
    for i, li in enumerate(items):
        if i > 0:
            children.append("; ")
        children.extend(list(li.children))
    if children:
        list_tag.replace_with(*children)
    else:
        list_tag.decompose()


def _flatten_multiblock_table_cells(html: str) -> str:
    """GFM's pipe tables can only hold a single line per cell, with no raw
    HTML fallback (raw_html is disabled). A cell with multiple paragraphs,
    or any list at all — even one item — has no representable form, so
    pandoc's gfm writer silently abandons the whole table for the literal
    placeholder text "[TABLE]". Flatten such cells to one plain-text line
    so the table survives, even though block/list structure within a cell
    is then lost (traded for a rendered table over none at all)."""
    if "<table" not in html:
        return html
    soup = BeautifulSoup(html, "html.parser")
    for cell in soup.find_all(["td", "th"]):
        for list_tag in cell.find_all(["ul", "ol"]):
            _inline_list(list_tag)

        blocks = cell.find_all(_CELL_PARAGRAPH_TAGS, recursive=False)
        if len(blocks) <= 1:
            continue
        children = []
        for i, block in enumerate(blocks):
            if i > 0:
                children.append(" ")
            children.extend(list(block.children))
        cell.clear()
        for child in children:
            cell.append(child)
    return str(soup)


def html_to_markdown(html: str) -> str:
    markdown = pypandoc.convert_text(_flatten_multiblock_table_cells(html), _MARKDOWN_TARGET, format="html")
    markdown = _DANGLING_HARD_BREAK.sub("", markdown)
    return _BACKTICK_MATH_RE.sub(lambda m: f"${m.group(1)}$", markdown)


def markdown_to_html(markdown: str) -> str:
    return pypandoc.convert_text(markdown, "html", format="markdown")
