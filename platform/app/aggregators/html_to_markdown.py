from __future__ import annotations

import re

import pypandoc


_MARKDOWN_TARGET = "gfm-raw_html-bracketed_spans-raw_attribute"

_DANGLING_HARD_BREAK = re.compile(r"\\(?=\r?\n\r?\n|\r?\n?$)")


def html_to_markdown(html: str) -> str:
    markdown = pypandoc.convert_text(html, _MARKDOWN_TARGET, format="html")
    return _DANGLING_HARD_BREAK.sub("", markdown)


def markdown_to_html(markdown: str) -> str:
    return pypandoc.convert_text(markdown, "html", format="markdown")
