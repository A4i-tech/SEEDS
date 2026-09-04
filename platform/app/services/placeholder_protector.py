from __future__ import annotations

import re

_TOKEN_FMT = "__PH{index}__"
_TOKEN_RE = re.compile(r"__PH\d+__")

_PATTERNS = [
    re.compile(r"\{\{.*?\}\}"),
    re.compile(r"\{[^{}\s]*\}"),
    re.compile(r"%(?:\d+\$)?[sdif]"),
    re.compile(r"!?\[[^\]]*\]\([^)]*\)"),
    re.compile(r"<[^<>]+>"),
]


def mask(text: str) -> tuple[str, dict[str, str]]:
    mapping: dict[str, str] = {}
    result = text
    index = 0
    for pattern in _PATTERNS:
        def _replace(match: re.Match[str]) -> str:
            nonlocal index
            token = _TOKEN_FMT.format(index=index)
            mapping[token] = match.group(0)
            index += 1
            return token

        result = pattern.sub(_replace, result)
    return result, mapping


def unmask(text: str, mapping: dict[str, str]) -> str:
    if not mapping:
        return text

    def _restore(match: re.Match[str]) -> str:
        token = match.group(0)
        return mapping.get(token, token)

    return _TOKEN_RE.sub(_restore, text)
