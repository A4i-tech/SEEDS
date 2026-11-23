from __future__ import annotations

from typing import Any


def has_wildcard(text: str) -> bool:
    return "*" in text or "?" in text


def glob_match(pattern: str, text: str) -> bool:
    p = t = 0
    star = mark = -1
    while t < len(text):
        if p < len(pattern) and pattern[p] == "*":
            star, mark = p, t
            p += 1
        elif p < len(pattern) and pattern[p] in ("?", text[t]):
            p += 1
            t += 1
        elif star >= 0:
            mark += 1
            p, t = star + 1, mark
        else:
            return False
    return pattern[p:].strip("*") == ""


class RuleSet:
    def __init__(self, rules: list[dict[str, Any]]) -> None:
        exclusions = [r for r in rules if r["kind"] == "exclusion"]
        overrides = [r for r in rules if r["kind"] == "override"]
        self.override_langs = {r["lang"] for r in overrides}
        self.exclusion_literals = {r["text"]: r for r in exclusions if not has_wildcard(r["text"])}
        self.exclusion_patterns = [r for r in exclusions if has_wildcard(r["text"])]
        self.override_literals = {(r["lang"], r["text"]): r for r in overrides if not has_wildcard(r["text"])}
        self.override_patterns: dict[str, list[dict[str, Any]]] = {}
        for r in overrides:
            if has_wildcard(r["text"]):
                self.override_patterns.setdefault(r["lang"], []).append(r)


def find_exclusion(rules: RuleSet, source_text: str) -> dict[str, Any] | None:
    literal = rules.exclusion_literals.get(source_text)
    if literal:
        return literal
    return next((r for r in rules.exclusion_patterns if glob_match(r["text"], source_text)), None)


def find_override(rules: RuleSet, source_text: str, lang: str) -> dict[str, Any] | None:
    literal = rules.override_literals.get((lang, source_text))
    if literal:
        return literal
    return max(
        (r for r in rules.override_patterns.get(lang, []) if glob_match(r["text"], source_text)),
        key=lambda r: (len(r["text"].replace("*", "").replace("?", "")), r["updated_at"]),
        default=None,
    )


def needs_generation(rules: RuleSet, doc: dict[str, Any], lang: str) -> bool:
    text = doc["translations"].get(lang, {}).get("text", "")
    return not (text or find_exclusion(rules, doc["source_text"]) or find_override(rules, doc["source_text"], lang))


def served_text(rules: RuleSet, doc: dict[str, Any], lang: str, first_party: bool) -> str:
    if find_exclusion(rules, doc["source_text"]):
        return doc["source_text"]
    entry = doc["translations"].get(lang, {})
    if entry.get("status") == "approved" and entry.get("text"):
        return entry["text"]
    override = find_override(rules, doc["source_text"], lang)
    if override:
        return override["translation"]
    return entry["text"] if first_party else doc["source_text"]
