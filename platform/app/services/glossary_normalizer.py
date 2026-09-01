"""Glossary term normalization — applied before Translation Memory / AI (ticket #436).

Encapsulated behind GlossaryNormalizer so future phases (phrase matching,
term priority ordering, tenant-specific glossaries, regex rules) are additive
changes to this one class, not to TranslationService.
"""

from __future__ import annotations

import re
from typing import Any


class GlossaryNormalizer:
    def apply(self, text: str, terms: list[dict[str, Any]]) -> str:
        """Replace whole-word, case-insensitive occurrences of each glossary term.

        Longest source terms are replaced first so overlapping terms (e.g.
        "sign" and "sign up") don't get partially clobbered by the shorter one.
        """
        result = text
        for term in sorted(terms, key=lambda t: len(t["sourceTerm"]), reverse=True):
            pattern = re.compile(r"\b" + re.escape(term["sourceTerm"]) + r"\b", re.IGNORECASE)
            result = pattern.sub(term["translatedTerm"], result)
        return result
