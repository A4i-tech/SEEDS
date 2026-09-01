"""
Masks placeholders/formatting before sending text to an AI translation
provider, then restores them from the model's output.

Applies uniformly to every `TranslationProvider` (stub/openai/groq/...) from
one place (`TranslationService.get_or_translate`) instead of duplicating
preservation logic per vendor.

Pragmatic regex-based masking of the concrete constructs ticket #436 names —
`{{variable}}`, `{name}`, `%s`-style printf tokens, HTML tags, and Markdown
link/image syntax. Not a full HTML/Markdown parser.
"""

from __future__ import annotations

import re

_TOKEN_FMT = "__PH{index}__"  # underscored so it reads as one opaque "word" to the model
_TOKEN_RE = re.compile(r"__PH\d+__")

# Order matters: double-brace before single-brace (avoid partial overlap),
# markdown images/links before bare HTML tags (a Markdown link has no tags
# but its brackets would otherwise be untouched — kept as its own pattern).
_PATTERNS = [
    re.compile(r"\{\{.*?\}\}"),  # {{variable}}
    re.compile(r"\{[^{}\s]*\}"),  # {name}
    re.compile(r"%(?:\d+\$)?[sdif]"),  # %s, %d, %1$s, ...
    re.compile(r"!?\[[^\]]*\]\([^)]*\)"),  # [text](url), ![alt](url)
    re.compile(r"<[^<>]+>"),  # HTML tags
]


def mask(text: str) -> tuple[str, dict[str, str]]:
    """Replace protected substrings with opaque tokens. Returns (masked_text, mapping)."""
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
    """Restore original substrings from the tokens produced by `mask`."""
    if not mapping:
        return text

    def _restore(match: re.Match[str]) -> str:
        token = match.group(0)
        return mapping.get(token, token)

    return _TOKEN_RE.sub(_restore, text)
