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


_PAGE_MARKER = re.compile(r"<!--\s*page\s+(\d+)\s*-->")
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_TAG = re.compile(r"<[^>]+>")
_RULE = re.compile(r"^[\s|:\-]+$", re.MULTILINE)
_MARKS = re.compile(r"[#>*_`|~]|^\s*[-+]\s", re.MULTILINE)
_SPACE = re.compile(r"\s+")


def percent(distance: int, length: int) -> float:
    return 100.0 if length == 0 else round(100 * (1 - distance / length), 1)


def readable_text(markdown: str) -> str:
    text = _LINK.sub(r"\1", _COMMENT.sub("", markdown))
    text = _MARKS.sub(" ", _TAG.sub(" ", _RULE.sub("", text)))
    return unicodedata.normalize("NFC", _SPACE.sub(" ", text)).strip()


def _pages(markdown: str) -> dict[str, str]:
    parts = _PAGE_MARKER.split(markdown)
    if len(parts) == 1:
        return {"0": parts[0]}
    pages = {"0": parts[0]} if parts[0].strip() else {}
    for number, body in zip(parts[1::2], parts[2::2], strict=True):
        pages[number] = pages.get(number, "") + body
    return pages


def score_edit(previous: str, new: str) -> Accuracy:
    before, after = _pages(previous), _pages(new)
    if before.keys() != after.keys():
        before, after = {"0": previous}, {"0": new}
    scores: list[PageScore] = []
    for page in sorted(before, key=int):
        a, b = readable_text(before[page]), readable_text(after[page])
        scores.append({"page": page, "distance": Levenshtein.distance(a, b), "length": max(len(a), len(b))})
    distance, length = sum(s["distance"] for s in scores), sum(s["length"] for s in scores)
    return {"percent": percent(distance, length), "distance": distance, "length": length, "pages": scores}
