from __future__ import annotations

import re
from difflib import SequenceMatcher

MAX_WORDS = 4
# A change counts only if both sides hold a letter or digit in any script.
_HAS_WORD = re.compile(r"\w")
# Markdown marks mean a style change, not a misread word.
_MARKUP = re.compile(r"[*_#|$`\\]")


def _word_pairs(old_line: str, new_line: str) -> list[tuple[str, str]]:
    old_words, new_words = old_line.split(), new_line.split()
    pairs = []
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, old_words, new_words, autojunk=False).get_opcodes():
        if tag != "replace" or i2 - i1 > MAX_WORDS or j2 - j1 > MAX_WORDS:
            continue
        wrong, right = " ".join(old_words[i1:i2]), " ".join(new_words[j1:j2])
        if _HAS_WORD.search(wrong) and _HAS_WORD.search(right) and not _MARKUP.search(wrong + right):
            pairs.append((wrong, right))
    return pairs


def edit_diff_pairs(previous: str, new: str) -> list[tuple[str, str]]:
    old_lines, new_lines = previous.splitlines(), new.splitlines()
    pairs = []
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, old_lines, new_lines).get_opcodes():
        # Unequal block sizes mean lines were added or removed, so no line pairs up.
        if tag == "replace" and i2 - i1 == j2 - j1:
            for old_line, new_line in zip(old_lines[i1:i2], new_lines[j1:j2], strict=True):
                pairs.extend(_word_pairs(old_line, new_line))
    return pairs
