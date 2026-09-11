"""OCR post-correction as an OmniIngest step.

Governing principle, taken from the ocr_extraction experiment:

    LLM proposes, code decides, verifier checks.

The model never edits text. It emits candidate edits; `_gate` re-derives every
rule in code and only Class A (character-level, mechanically checkable) edits
can ever auto-apply. Everything else is queued for a human. The source resource
is never modified — the step writes new artifacts under `out_dir`.

Register by importing this module before building a pipeline that names the
`postcorrect` step (see `run.py`).
"""

from __future__ import annotations

import asyncio
import json
import re
import unicodedata
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, Field, PositiveInt
from pydantic_ai import NativeOutput

if TYPE_CHECKING:
    from omni_ingest.core.pipeline import IngestionContext

from omni_ingest.core.model import AgentMixin, ResolvedResource, Step, StepResult, StepStatus
from omni_ingest.core.pipeline import register_step

LATEX_BRACED_COMMANDS = ("begin", "end", "substack", "xrightarrow", "xleftarrow", "overset", "underset", "mathrm", "frac", "text")
LATEX_BARE_COMMANDS = ("longrightarrow", "longleftarrow", "rightarrow", "leftarrow", "leftrightarrow", "rightleftharpoons", "uparrow", "downarrow")

CLASS_A_TYPES = frozenset({"wrong_matra", "missing_char", "extra_char", "wrong_glyph", "broken_ligature", "malformed_unicode"})
CLASS_B_TYPES = frozenset({"wrong_word", "merged_words", "split_word", "duplicated_text", "dropped_text"})
QUEUE_ONLY_TYPES = frozenset({"structure", "formula", "table", "figure"})

CALIBRATED_SCRIPTS = frozenset({"devanagari"})

_ALT_TEXT = re.compile(r"!\[[^\]]*\]")
_BRACED = re.compile(r"(?<![\\a-zA-Z])(" + "|".join(LATEX_BRACED_COMMANDS) + r")(?=\s*[{\[])")
_BARE = re.compile(r"(?<![\\a-zA-Z])(" + "|".join(LATEX_BARE_COMMANDS) + r")\b")
_DUP_COMBINING = re.compile(r"([̀-ͯऀ-ःऺ-ॏ॑-ॗஂா-்])\1")
_BEAUTIFY_STRIP = re.compile(r"[_^{}$\s]")
_DIGITS = re.compile(r"\d")

_PROTECTED = [
    ("image_ref", re.compile(r"!\[[^\]]*\]\([^)]*\)")),
    ("html_tag", re.compile(r"<[^>]+>")),
    ("latex_command", re.compile(r"\\[a-zA-Z]+")),
    ("chemical_formula", re.compile(r"\b(?:[A-Z][a-z]?(?:_\{?\d+\}?)?){1,6}(?:\^\{?[0-9]*[+-]\}?)?(?:\((?:aq|s|l|g)\))?")),
    ("number_unit", re.compile(r"\b\d+(?:\.\d+)?\s?(?:mL|L|g|kg|cm|mm|m|°C|K|atm|mol|N|J|W|V|A)\b")),
    ("equation_number", re.compile(r"\(\d+\.\d+\)")),
]

AUDIT_PROMPT = """You are auditing OCR output of a school textbook for transcription errors.

Evidence hierarchy — you are reading text only, with no page image:
  level 1  a structural property of the text itself
  level 3  a region that merely looks unusual

Rules:
* Report only what the text itself is evidence for. Never reconstruct what OCR
  discarded: an empty table, a U+FFFD, a dropped group with no trace in the
  text is `structure` with decision `queue`, never a guessed replacement.
* `wrong` must be an exact substring of the unit. `context_before` and
  `context_after` must be the exact surrounding characters so the edit can be
  anchored unambiguously.
* Representation changes are not corrections. Fe_3O_4 -> Fe3O4, or wrapping a
  span in $...$, are out of scope.
* decision `auto_apply` only for character-level, mechanically checkable edits
  you are >= 0.97 confident in. Otherwise `review`, or `queue` when a human
  needs the page image.
* Finding nothing is a valid and common answer. Return an empty list.

Types: wrong_matra, missing_char, extra_char, wrong_glyph, broken_ligature,
malformed_unicode, wrong_word, merged_words, split_word, duplicated_text,
dropped_text, structure, formula, table, figure."""


class Edit(BaseModel):
    type: str
    wrong: str
    correct: str
    context_before: str = ""
    context_after: str = ""
    confidence: float
    decision: Literal["auto_apply", "review", "queue"]
    reason: str = ""


class UnitFindings(BaseModel):
    edits: list[Edit] = Field(default_factory=list)


def mechanical(text: str) -> tuple[str, list[dict[str, Any]]]:
    """Deterministic fixes. Provably meaning-preserving or checkable against a closed list."""
    changes: list[dict[str, Any]] = []
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    composed = unicodedata.normalize("NFC", text)
    if composed != text:
        changes.append({"rule": "nfc", "offset": 0, "before": "", "after": "", "context": ""})
        text = composed

    protected = [m.span() for m in _ALT_TEXT.finditer(text)]

    def edit(pattern: re.Pattern[str], rule: str, replace) -> None:
        nonlocal text
        for m in reversed(list(pattern.finditer(text))):
            if any(s <= m.start() < e for s, e in protected):
                continue
            after = replace(m)
            if after == m.group(0):
                continue
            changes.append({"rule": rule, "offset": m.start(), "before": m.group(0), "after": after,
                            "context": text[max(0, m.start() - 40):m.end() + 40]})
            text = text[:m.start()] + after + text[m.end():]

    edit(_BRACED, "latex_backslash", lambda m: "\\" + m.group(1))
    edit(_BARE, "latex_backslash", lambda m: "\\" + m.group(1))
    edit(_DUP_COMBINING, "duplicate_combining", lambda m: m.group(1))
    return text, changes


def chunk(text: str, max_chars: int) -> list[str]:
    """Audit units. Blank lines split blocks, so a table or list is never cut in half."""
    blocks, buffer, fence = [], [], False
    for line in text.split("\n"):
        if line.lstrip().startswith("```") or line.strip() == "$$":
            fence = not fence
        if not fence and not line.strip():
            if buffer:
                blocks.append("\n".join(buffer))
                buffer = []
            continue
        buffer.append(line)
    if buffer:
        blocks.append("\n".join(buffer))

    units, current = [], ""
    for block in blocks:
        if current and len(current) + len(block) > max_chars:
            units.append(current)
            current = block
        else:
            current = f"{current}\n\n{block}" if current else block
    if current:
        units.append(current)
    return units


def _protected_spans(text: str) -> list[tuple[int, int]]:
    return [m.span() for _, pattern in _PROTECTED for m in pattern.finditer(text) if m.group(0).strip()]


def _classify(edit_type: str) -> str:
    t = (edit_type or "").strip().lower()
    if t in CLASS_A_TYPES:
        return "A"
    if t in QUEUE_ONLY_TYPES:
        return "queue"
    return "B"


def _locate(unit: str, e: Edit) -> tuple[int, int] | str:
    """Anchor on the full context triple. A bare `wrong` match lands on neighbours."""
    if not e.wrong:
        return "empty `wrong`"
    attempts = [(e.context_before, e.context_after)]
    short = (e.context_before[-15:], e.context_after[:15])
    if (e.context_before or e.context_after) and short != attempts[0]:
        attempts.append(short)
    for before, after in attempts:
        hits = [m.start() for m in re.finditer(re.escape(before + e.wrong + after), unit)]
        if len(hits) == 1:
            return hits[0] + len(before), hits[0] + len(before) + len(e.wrong)
        if len(hits) > 1:
            return f"ambiguous anchor ({len(hits)} matches)"
    return "anchor not found"


def _gate(unit: str, e: Edit, applied_delta: int, script: str, min_confidence: float, max_delta: float) -> tuple[str, str]:
    """Re-derive every rule in code. Returns (gate, detail); gate 'pass' means apply."""
    if script not in CALIBRATED_SCRIPTS:
        return "script_uncalibrated", f"{script} has no measured false-positive rate"
    if e.decision != "auto_apply":
        return "decision", e.decision
    if e.confidence < min_confidence:
        return "confidence", f"{e.confidence:.2f} < {min_confidence}"
    if (cls := _classify(e.type)) != "A":
        return "class", f"class {cls}"
    if _BEAUTIFY_STRIP.sub("", e.wrong) == _BEAUTIFY_STRIP.sub("", e.correct):
        return "beautification", "representation change, not a correction"
    span = _locate(unit, e)
    if isinstance(span, str):
        return "anchoring", span
    start, end = span
    if any(s < end and start < t for s, t in _protected_spans(unit)):
        return "protected_span", "edit intersects a span that must survive byte-identical"
    if (applied_delta + abs(len(e.correct) - len(e.wrong))) > max_delta * len(unit):
        return "budget", f"unit would change by more than {max_delta:.0%}"
    return "pass", f"{start}:{end}"


def verify(before: str, after: str, max_delta: float) -> str | None:
    """Post-checks re-derived on the patched unit. Returns a failure reason, or None."""
    if sorted(_DIGITS.findall(before)) != sorted(_DIGITS.findall(after)):
        return "digits changed"
    if len(_protected_spans(before)) != len(_protected_spans(after)):
        return "protected span count changed"
    if abs(len(after) - len(before)) > max_delta * len(before):
        return "length delta over budget"
    return None


class PostCorrectAgent(BaseModel, Step, AgentMixin):
    """Post-corrects OCR Markdown: mechanical fixes, gated model proposals, verification."""

    out_dir: Path = Field(default=Path("out"), description="Directory for corrected Markdown and the findings trail")
    script: str = Field(default="latin", description="Script of the source text; only calibrated scripts may auto-apply")
    audit: bool = Field(default=True, description="Run the model audit stage (this is the only stage that spends money)")
    auto_apply: bool = Field(default=False, description="Allow gated edits to be written; false queues everything")
    chunk_chars: PositiveInt = Field(default=3500, description="Maximum characters per audit unit")
    min_confidence: float = Field(default=0.97, description="Confidence floor for auto-apply")
    max_unit_delta: float = Field(default=0.05, description="Maximum fraction of a unit's characters that may change")
    concurrency: PositiveInt = Field(default=4, description="Audit units processed concurrently")

    async def run(self, ctx: IngestionContext[ResolvedResource]) -> StepResult:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        paths, total = {}, {"mechanical": 0, "proposed": 0, "applied": 0, "queued": 0, "reverted": 0}

        for item in ctx.items:
            if not (await item.content_type(ctx)).startswith("text/"):
                continue
            text, changes = mechanical(await item.decode(ctx))
            units = chunk(text, self.chunk_chars)
            findings = [{"stage": "mechanical", **c} for c in changes]

            corrected = units
            if self.audit:
                corrected, records = await self._audit(ctx, units)
                findings.extend(records)

            output = "\n\n".join(corrected)
            item.raw_content = output.encode("utf-8")
            item.content_uri = None
            item.content_encoding = "utf-8"

            stem = Path(item.source_uri or str(item.id)).stem
            md, trail = self.out_dir / f"{stem}.corrected.md", self.out_dir / f"{stem}.findings.jsonl"
            md.write_text(output, encoding="utf-8")
            trail.write_text("".join(json.dumps(f, ensure_ascii=False) + "\n" for f in findings), encoding="utf-8")
            paths[f"{stem}.md"], paths[f"{stem}.findings"] = str(md), str(trail)

            counts = {
                "mechanical": len(changes),
                "proposed": sum(1 for f in findings if f["stage"] == "audit"),
                "applied": sum(1 for f in findings if f.get("gate") == "pass"),
                "queued": sum(1 for f in findings if f["stage"] == "audit" and f.get("gate") != "pass"),
                "reverted": sum(1 for f in findings if f["stage"] == "verify"),
            }
            item.metadata["post_correction"] = {**counts, "script": self.script, "auto_apply": self.auto_apply}
            for k, v in counts.items():
                total[k] += v

        return StepResult(status=StepStatus.SUCCESS, items=ctx.items, output_paths=paths, metadata=total)

    async def _audit(self, ctx: IngestionContext[ResolvedResource], units: list[str]) -> tuple[list[str], list[dict[str, Any]]]:
        agent = self._agent(ctx, output_type=NativeOutput(UnitFindings, strict=True))
        sem = asyncio.Semaphore(self.concurrency)
        ctx.progress(0, len(units), "auditing")

        async def audit_one(index: int, unit: str) -> tuple[int, str, list[dict[str, Any]]]:
            async with sem:
                async with agent:
                    result = await agent.run([AUDIT_PROMPT, unit])
            return (index, *self._apply(f"u{index:04d}", unit, result.output.edits))

        results = []
        tasks = [audit_one(i, unit) for i, unit in enumerate(units)]
        for done, task in enumerate(asyncio.as_completed(tasks), 1):
            results.append(await task)
            ctx.progress(done, len(units), f"audited {done}/{len(units)}")

        results.sort()
        return [unit for _, unit, _ in results], [record for _, _, records in results for record in records]

    def _apply(self, unit_id: str, unit: str, edits: list[Edit]) -> tuple[str, list[dict[str, Any]]]:
        original, patched, delta, records = unit, unit, 0, []
        for n, e in enumerate(edits):
            gate, detail = _gate(patched, e, delta, self.script, self.min_confidence, self.max_unit_delta)
            if gate == "pass" and not self.auto_apply:
                gate, detail = "auto_apply_disabled", "queued because auto_apply is off"
            records.append({"stage": "audit", "unit_id": unit_id, "edit_id": f"{unit_id}e{n:03d}",
                            "gate": gate, "detail": detail, **e.model_dump()})
            if gate != "pass":
                continue
            start, end = (int(v) for v in detail.split(":"))
            patched = patched[:start] + e.correct + patched[end:]
            delta += abs(len(e.correct) - len(e.wrong))

        if patched != original and (reason := verify(original, patched, self.max_unit_delta)):
            records.append({"stage": "verify", "unit_id": unit_id, "gate": "reverted", "detail": reason})
            return original, records
        return patched, records


register_step("postcorrect", PostCorrectAgent)
