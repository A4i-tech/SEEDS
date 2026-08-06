from __future__ import annotations

import pypandoc


def html_to_markdown(html: str) -> str:
    return pypandoc.convert_text(html, "markdown", format="html")


def markdown_to_html(markdown: str) -> str:
    return pypandoc.convert_text(markdown, "html", format="markdown")
