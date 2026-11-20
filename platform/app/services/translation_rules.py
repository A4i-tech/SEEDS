from __future__ import annotations

import re
from functools import cache
from typing import Any

_WILDCARD_RE = re.compile(r"([*?])")


@cache
def _regex(text: str) -> re.Pattern[str]:
    pieces = [
        {"*": ".*", "?": "."}.get(piece, re.escape(piece)) for piece in _WILDCARD_RE.split(text)
    ]
    return re.compile("".join(pieces), re.DOTALL)


def _matches(rule: dict[str, Any], source_text: str) -> bool:
    return _regex(rule["text"]).fullmatch(source_text) is not None


def find_exclusion(rules: list[dict[str, Any]], source_text: str) -> dict[str, Any] | None:
    return next(
        (r for r in rules if r["kind"] == "exclusion" and _matches(r, source_text)),
        None,
    )


def find_override(rules: list[dict[str, Any]], source_text: str, lang: str) -> dict[str, Any] | None:
    matched = [
        r for r in rules if r["kind"] == "override" and r["lang"] == lang and _matches(r, source_text)
    ]
    return max(
        matched,
        key=lambda r: (
            _WILDCARD_RE.search(r["text"]) is None,
            len(_WILDCARD_RE.sub("", r["text"])),
            r["updated_at"],
        ),
        default=None,
    )


def served_text(rules: list[dict[str, Any]], doc: dict[str, Any], lang: str, first_party: bool) -> str:
    if find_exclusion(rules, doc["source_text"]):
        return doc["source_text"]
    existing = (doc.get("translations") or {}).get(lang)
    has_text = bool(existing and existing.get("text"))
    if has_text and existing.get("status") == "approved":
        return existing["text"]
    override = find_override(rules, doc["source_text"], lang)
    if override:
        return override["translation"]
    if has_text:
        return existing["text"] if first_party else doc["source_text"]
    return ""
