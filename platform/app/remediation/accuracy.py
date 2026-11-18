from __future__ import annotations

import re
import unicodedata
from typing import TypedDict

from rapidfuzz.distance import Levenshtein


class PageScore(TypedDict):
    page: str
    distance: int
    length: int


class Accuracy(TypedDict):
    percent: float
    distance: int
    length: int
    pages: list[PageScore]


# The marker the Markdown builder writes at the start of every page.
_PAGE_MARKER = re.compile(r"<!--\s*page\s+(\d+)\s*-->")
# An HTML comment, such as a spoken note, across lines.
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
# An image or a link in Markdown: keep the visible text or the alt text.
_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
# Any HTML or MathML tag. The text between the tags stays.
_TAG = re.compile(r"<[^>]+>")
# A table separator row or a horizontal rule: only dashes, colons, bars and spaces.
_RULE = re.compile(r"^[\s|:\-]+$", re.MULTILINE)
# Marks that only give structure: headings, quotes, emphasis, table bars, list dashes.
_MARKS = re.compile(r"[#>*_`|~]|^\s*[-+]\s", re.MULTILINE)
_SPACE = re.compile(r"\s+")


def readable_text(markdown: str) -> str:
    text = _LINK.sub(r"\1", _COMMENT.sub("", markdown))
    text = _MARKS.sub(" ", _TAG.sub(" ", _RULE.sub("", text)))
    return unicodedata.normalize("NFC", _SPACE.sub(" ", text)).strip()


def _pages(markdown: str) -> dict[str, str]:
    parts = _PAGE_MARKER.split(markdown)
    if len(parts) == 1:
        return {"0": parts[0]}
    # parts is [text before the first marker, page number, page text, page number, page text, ...].
    pages = {"0": parts[0]} if parts[0].strip() else {}
    for number, body in zip(parts[1::2], parts[2::2], strict=True):
        pages[number] = pages.get(number, "") + body
    return pages


def score_edit(previous: str, new: str) -> Accuracy:
    """Character accuracy of the machine output (previous) against the reviewed text (new), page by page."""
    before, after = _pages(previous), _pages(new)
    if before.keys() != after.keys():
        # A lost or added page marker would pair the wrong pages, so score the whole text as one page.
        before, after = {"0": previous}, {"0": new}
    scores: list[PageScore] = []
    for page in sorted(before.keys() | after.keys(), key=int):
        a, b = readable_text(before.get(page, "")), readable_text(after.get(page, ""))
        scores.append({"page": page, "distance": Levenshtein.distance(a, b), "length": max(len(a), len(b))})
    distance, length = sum(s["distance"] for s in scores), sum(s["length"] for s in scores)
    percent = 100.0 if length == 0 else round(100 * (1 - distance / length), 1)
    return {"percent": percent, "distance": distance, "length": length, "pages": scores}
