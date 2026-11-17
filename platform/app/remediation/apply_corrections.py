from __future__ import annotations

import re
from typing import Any

from omni_ingest.core.model import Step, StepResult, StepStatus
from omni_ingest.core.pipeline import IngestionContext, register_step
from pydantic import BaseModel, Field

from app.remediation.detect_language import normalize_language_name

ENGINE_NAME = "apply_corrections"
# Word characters: \w plus Indic letters, vowel signs and digits (U+0900-U+0DFF), minus the danda marks U+0964-U+0965.
WORD_CHAR = r"[\wऀ-ॣ०-෿]"


def _same(a: str, b: str) -> bool:
    return a.strip().casefold() == b.strip().casefold()


def _language_matches(row_language: str, book_language: str) -> bool:
    return _same(normalize_language_name(row_language), normalize_language_name(book_language))


def _grade_matches(row_grade: str, book_grade: str) -> bool:
    # Strip every non-digit, so "Class 9" becomes "9".
    row_digits = re.sub(r"\D", "", row_grade)
    if not row_digits:
        return _same(row_grade, book_grade)
    # Same digit-only form of the book grade.
    return row_digits == re.sub(r"\D", "", book_grade)


def _row_applies(row: dict[str, Any], book: dict[str, Any], text: str) -> bool:
    if not book["language"] or not _language_matches(row["language"], book["language"]):
        return False
    if row["grade"] and not _grade_matches(row["grade"], book["grade"] or ""):
        return False
    if row["subject"] and not _same(row["subject"], book["subject"] or ""):
        return False
    return not row["context"] or row["context"] in text


def apply_to_text(text: str, rows: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    rights: dict[str, str] = {}
    for row in sorted(rows, key=lambda r: len(r["wrong"]), reverse=True):
        rights.setdefault(row["wrong"], row["right"])
    if not rights:
        return text, []
    # One pattern: any escaped wrong string that is not glued to a word character on either side.
    pattern = re.compile(f"(?<!{WORD_CHAR})(?:" + "|".join(re.escape(w) for w in rights) + f")(?!{WORD_CHAR})")
    counts = dict.fromkeys(rights, 0)

    def replace(match: re.Match[str]) -> str:
        counts[match.group(0)] += 1
        return rights[match.group(0)]

    new_text = pattern.sub(replace, text)
    return new_text, [{"wrong": w, "right": rights[w], "count": n} for w, n in counts.items() if n]


class ApplyCorrectionsAgent(BaseModel, Step):
    corrections: list[dict[str, Any]] = Field(default_factory=list)

    def _fix(self, text: str, book: dict[str, Any], applied: list[dict[str, Any]]) -> str:
        rows = [r for r in self.corrections if _row_applies(r, book, text)]
        new_text, counts = apply_to_text(text, rows)
        applied.extend(counts)
        return new_text

    async def run(self, ctx: IngestionContext) -> StepResult:
        book = ctx.metadata["book"]
        for item in ctx.items:
            if item.metadata.get("kind") == "image":
                continue
            verified = item.metadata["verified"]
            applied: list[dict[str, Any]] = []
            verified["markdown"] = self._fix(verified["markdown"], book, applied)
            remediation = item.metadata.get("remediation")
            if remediation:
                for block in remediation["blocks"]:
                    block["text"] = self._fix(block["text"], book, applied)
                    if block.get("items"):
                        block["items"] = [self._fix(entry, book, applied) for entry in block["items"]]
            item.metadata["corrections_applied"] = [*item.metadata.get("corrections_applied", []), *applied]
        return StepResult(status=StepStatus.SUCCESS, items=ctx.items)


register_step(ENGINE_NAME, ApplyCorrectionsAgent)
