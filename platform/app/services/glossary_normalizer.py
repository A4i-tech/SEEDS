from __future__ import annotations

import re
from typing import Any


class GlossaryNormalizer:
    def apply(self, text: str, terms: list[dict[str, Any]]) -> str:
        result = text
        for term in sorted(terms, key=lambda t: len(t["source_term"]), reverse=True):
            pattern = re.compile(r"\b" + re.escape(term["source_term"]) + r"\b", re.IGNORECASE)
            result = pattern.sub(term["translated_term"], result)
        return result
