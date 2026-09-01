"""Python port of translation-proxy/public/sdk.js's client-side hashText().

Any backend code that persists a translation document for content the SDK
will independently discover in the DOM must derive the same `key` the SDK
computes for that text, or swapText() will never find a match in its
registry and the translation will silently fail to render.
"""

from __future__ import annotations

_BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def _to_base36(value: int) -> str:
    if value == 0:
        return "0"
    digits: list[str] = []
    while value:
        value, remainder = divmod(value, 36)
        digits.append(_BASE36[remainder])
    return "".join(reversed(digits))


def sdk_hash_text(text: str) -> str:
    """Mirror sdk.js: 32-bit signed rolling hash, base36, "t" prefix."""
    h = 0
    for ch in text:
        h = (h << 5) - h + ord(ch)
        h &= 0xFFFFFFFF
    if h >= 0x80000000:
        h -= 0x100000000
    return "t" + _to_base36(abs(h))
