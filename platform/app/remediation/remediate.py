"""Turns corrected OCR Markdown into an accessible Word document.

Two steps, split so the .docx can be rebuilt without re-running OCR or the audit:

    remediate   strip page furniture, summarise tables, fix heading levels
    docx        pandoc -> .docx

The remediation rules come from the Tamil Nadu and I-Stem textbook workflows,
where all of this is done by hand today: page numbers and running heads are
noise to a screen reader, a table needs a sentence saying what it holds before
a reader enters it, and heading levels have to descend one at a time for
document navigation to work.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pypandoc
from pydantic import BaseModel, Field
from pydantic_ai import NativeOutput

if TYPE_CHECKING:
    from omni_ingest.core.pipeline import IngestionContext

from omni_ingest.core.model import AgentMixin, ResolvedResource, Step, StepResult, StepStatus
from omni_ingest.core.pipeline import register_step

_IMAGE = re.compile(r"!\[([^\]]*)\]\(([^)]*)\)")
_HEADING = re.compile(r"^(#{1,6})(\s+\S.*)$")
_TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
_TABLE_RULE = re.compile(r"^\s*\|[\s:|-]+\|\s*$")

FURNITURE = [
    ("page_number", re.compile(r"^\s*\d{1,4}\s*$")),
    ("roman_page_number", re.compile(r"^\s*[ivxlcdm]{1,7}\s*$", re.IGNORECASE)),
    ("bare_url", re.compile(r"^\s*(?:https?://|www\.)\S+\s*$", re.IGNORECASE)),
    ("qr_caption", re.compile(r"^\s*(?:scan\s+)?(?:the\s+)?qr\s*code[^.]{0,60}\.?\s*$", re.IGNORECASE)),
]

SUMMARY_PROMPT = """Write one sentence describing what this table contains, for a
blind student who is about to read it with a screen reader.

Say how many rows and columns it has, what the columns are, and what the table is
for. Do not list the data. Do not repeat the table. Return the sentence only, in
the same language as the table."""


class TableSummary(BaseModel):
    sentence: str


def strip_furniture(text: str) -> tuple[str, list[dict[str, Any]]]:
    """Removes standalone page furniture. A number alone on a line, never one inside a sentence."""
    kept, removed = [], []
    for number, line in enumerate(text.split("\n"), 1):
        rule = next((name for name, pattern in FURNITURE if pattern.match(line)), None)
        if rule:
            removed.append({"stage": "remediate", "rule": rule, "line": number, "removed": line.strip()})
        else:
            kept.append(line)
    return "\n".join(kept), removed


def fix_heading_levels(text: str) -> tuple[str, list[dict[str, Any]]]:
    """First heading becomes H1 and levels descend one at a time, so navigation works."""
    lines, changes, top, previous = text.split("\n"), [], None, 0
    for index, line in enumerate(lines):
        if not (m := _HEADING.match(line)):
            continue
        raw = len(m.group(1))
        if top is None:
            top = raw
        level = max(1, raw - top + 1)
        level = min(level, previous + 1) if previous else 1
        previous = level
        if level != raw:
            changes.append({"stage": "remediate", "rule": "heading_level", "line": index + 1,
                            "before": raw, "after": level, "heading": m.group(2).strip()})
            lines[index] = "#" * level + m.group(2)
    return "\n".join(lines), changes


def table_blocks(text: str) -> list[tuple[int, int]]:
    """(first, last) line indices of every Markdown table, header rule included."""
    lines, blocks, start = text.split("\n"), [], None
    for index, line in enumerate(lines):
        if _TABLE_ROW.match(line):
            start = index if start is None else start
            continue
        if start is not None:
            if any(_TABLE_RULE.match(lines[i]) for i in range(start, index)):
                blocks.append((start, index - 1))
            start = None
    if start is not None and any(_TABLE_RULE.match(lines[i]) for i in range(start, len(lines))):
        blocks.append((start, len(lines) - 1))
    return blocks


def inline_unresolved_images(text: str, base: Path) -> tuple[str, list[dict[str, Any]], int]:
    """Alt text of an image pandoc cannot resolve becomes a visible paragraph.

    Pandoc drops an image *and* its alt text when the `src` does not resolve, so
    leaving these alone loses the figure description silently. A visible line is
    a worse document than a real alt-text field and a far better one than nothing.
    """
    records, resolved = [], 0

    def replace(m: re.Match[str]) -> str:
        nonlocal resolved
        alt, src = m.group(1), m.group(2)
        if src and not src.startswith(("http://", "https://")) and (base / src).exists():
            resolved += 1
            return m.group(0)
        records.append({"stage": "docx", "rule": "unresolved_image", "src": src, "alt": alt})
        return f"**Figure.** {alt}" if alt.strip() else "**Figure.** (no description available)"

    return _IMAGE.sub(replace, text), records, resolved


class RemediateAgent(BaseModel, Step, AgentMixin):
    """Applies the manual remediation rules to Markdown: furniture, tables, headings."""

    out_dir: Path = Field(default=Path("out"), description="Directory for remediated Markdown and its trail")
    summarise_tables: bool = Field(default=True, description="Add a one-sentence summary above each table (the only stage that spends money)")

    async def run(self, ctx: IngestionContext[ResolvedResource]) -> StepResult:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        paths, total = {}, {"furniture_removed": 0, "headings_fixed": 0, "tables_summarised": 0}

        for item in ctx.items:
            if not (await item.content_type(ctx)).startswith("text/"):
                continue
            text, removed = strip_furniture(await item.decode(ctx))
            text, headings = fix_heading_levels(text)
            records = removed + headings

            summaries = []
            if self.summarise_tables:
                text, summaries = await self._summarise(ctx, text)
                records.extend(summaries)

            item.raw_content = text.encode("utf-8")
            item.content_uri = None
            item.content_encoding = "utf-8"

            stem = Path(item.source_uri or str(item.id)).stem
            md, trail = self.out_dir / f"{stem}.remediated.md", self.out_dir / f"{stem}.remediation.jsonl"
            md.write_text(text, encoding="utf-8")
            trail.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")
            paths[f"{stem}.md"], paths[f"{stem}.trail"] = str(md), str(trail)

            counts = {"furniture_removed": len(removed), "headings_fixed": len(headings), "tables_summarised": len(summaries)}
            item.metadata["remediation"] = counts
            for key, value in counts.items():
                total[key] += value

        return StepResult(status=StepStatus.SUCCESS, items=ctx.items, output_paths=paths, metadata=total)

    async def _summarise(self, ctx: IngestionContext[ResolvedResource], text: str) -> tuple[str, list[dict[str, Any]]]:
        blocks = table_blocks(text)
        if not blocks:
            return text, []

        agent = self._agent(ctx, output_type=NativeOutput(TableSummary, strict=True))
        lines, records = text.split("\n"), []
        ctx.progress(0, len(blocks), "summarising tables")

        for done, (first, last) in enumerate(reversed(blocks), 1):
            table = "\n".join(lines[first:last + 1])
            async with agent:
                result = await agent.run([SUMMARY_PROMPT, table])
            lines[first:first] = [result.output.sentence, ""]
            records.append({"stage": "remediate", "rule": "table_summary", "line": first + 1,
                            "summary": result.output.sentence})
            ctx.progress(done, len(blocks), f"summarised {done}/{len(blocks)}")

        records.reverse()
        return "\n".join(lines), records


class DocxAgent(BaseModel, Step):
    """Writes the Markdown to an accessible .docx with pandoc.

    Pandoc gives us the parts NVDA and Duxbury need for free: `$...$` becomes
    OMML, tables become real Word tables, headings become Word heading styles,
    and image alt text becomes the `descr` field a screen reader announces.
    """

    out: Path = Field(default=Path("out/remediated.docx"), description="Path the .docx is written to")
    assets_dir: Path | None = Field(default=None, description="Directory image `src` values resolve against; defaults to the Markdown's own directory")
    reference_docx: Path | None = Field(default=None, description="Word template supplying the document's styles")

    async def run(self, ctx: IngestionContext[ResolvedResource]) -> StepResult:
        texts, base = [], self.assets_dir
        for item in ctx.items:
            if not (await item.content_type(ctx)).startswith("text/"):
                continue
            texts.append(await item.decode(ctx))
            if base is None and item.source_uri:
                base = Path(item.source_uri).parent
        if not texts:
            raise ValueError("No text items to write; run the Markdown stages first")

        markdown, records, resolved = inline_unresolved_images("\n\n".join(texts), base or Path())

        self.out.parent.mkdir(parents=True, exist_ok=True)
        arguments = ["--standalone", f"--resource-path={base or Path()}"]
        if self.reference_docx:
            arguments.append(f"--reference-doc={self.reference_docx}")
        pypandoc.convert_text(markdown, "docx", format="markdown+tex_math_dollars",
                              outputfile=str(self.out), extra_args=arguments)

        if records:
            trail = self.out.with_suffix(".unresolved.jsonl")
            trail.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")

        metadata = {"images_resolved": resolved, "images_inlined": len(records), "bytes": self.out.stat().st_size}
        ctx.metadata["docx"] = {"path": str(self.out), **metadata}
        return StepResult(status=StepStatus.SUCCESS, items=ctx.items, output_paths={"docx": str(self.out)}, metadata=metadata)


register_step("remediate", RemediateAgent)
register_step("docx", DocxAgent)
