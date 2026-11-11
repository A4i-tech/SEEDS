from __future__ import annotations

import json
import re
import textwrap
from pathlib import Path
from typing import Literal

import louis
import pypandoc
from pydantic import BaseModel

from app.models.remediation_job import JobStatus, RemediationJob
from app.platform.error_handling import ValidationError

TABLES_FILTER = Path(__file__).with_name("braille_tables.lua")
DISPLAY_TABLE = "en-us-brf.dis"
CELLS_PER_LINE = 40
LINES_PER_PAGE = 25

LANGUAGE_TABLES: dict[str, str] = {
    "en": "en-ueb-g2.ctb",
    "hi": "hi-in-g1.utb",
    "kn": "ka-in-g1.utb",
    "ta": "ta-ta-g1.ctb",
    "te": "te-in-g1.utb",
    "ml": "ml-in-g1.utb",
    "mr": "mr-in-g1.utb",
    "gu": "gu-in-g1.utb",
    "or": "or-in-g1.utb",
    "as": "as-in-g1.utb",
}

_MATHML_RE = re.compile(r"<math\b.*?</math>(?:\s*<!--\s*spoken:\s*(.*?)\s*-->)?", re.DOTALL)
_HTML_TABLE_RE = re.compile(r"<table\b.*?</table>", re.DOTALL | re.IGNORECASE)
_UNMAPPED_RE = re.compile(r"\\(?:x[0-9a-f]{4}|y[0-9a-f]{5}|z[0-9a-f]{8})", re.IGNORECASE)
_ODD_SPACE_RE = re.compile(r"[\u00a0\u2000-\u200a\u202f]")
_CELL_MARK = "\ue000"
_READ_FORMAT = "markdown+tex_math_dollars-raw_tex-smart"
_PIPE_TABLES = "markdown-simple_tables-multiline_tables-grid_tables"


class BrailleWarning(BaseModel):
    type: str
    detail: str
    confidence: Literal["low", "medium"]


class BrailleCounts(BaseModel):
    equations: int = 0
    tables: int = 0
    images_without_alt: int = 0


class BrailleReport(BaseModel):
    table: str
    counts: BrailleCounts
    warnings: list[BrailleWarning]
    needs_review: bool


def validate_braille_job(job: RemediationJob) -> str:
    if job.status != JobStatus.VERIFIED:
        raise ValidationError("Braille needs a verified document. Verify the job, then generate Braille.")
    if job.language not in LANGUAGE_TABLES:
        raise ValidationError(
            f"Braille is not available for language {job.language!r}. Supported languages: {sorted(LANGUAGE_TABLES)}."
        )
    return job.language


def _html_table_to_markdown(match: re.Match[str]) -> str:
    return pypandoc.convert_text(match.group(0), _PIPE_TABLES, format="html")


def _walk(node: object):
    if isinstance(node, dict):
        yield node
        node = node.get("c", [])
    if isinstance(node, list):
        for child in node:
            yield from _walk(child)


def markdown_to_braille_text(markdown: str) -> tuple[str, BrailleCounts, list[BrailleWarning]]:
    counts = BrailleCounts()
    warnings: list[BrailleWarning] = []

    def spoken(match: re.Match[str]) -> str:
        counts.equations += 1
        text = (match.group(1) or "").strip()
        if not text:
            warnings.append(BrailleWarning(type="equation", detail="MathML has no spoken form and was left out. Braille the equation by hand.", confidence="low"))
            return "[Equation missing]"
        warnings.append(BrailleWarning(type="equation", detail=f"Equation converted from its spoken form: {text[:80]}", confidence="low"))
        return text

    body = _HTML_TABLE_RE.sub(_html_table_to_markdown, _MATHML_RE.sub(spoken, markdown))
    ast = pypandoc.convert_text(body, "json", format=_READ_FORMAT)
    nodes = list(_walk(json.loads(ast)["blocks"]))
    math = sum(n["t"] == "Math" for n in nodes)
    counts.equations += math
    counts.tables = sum(n["t"] == "Table" for n in nodes)
    counts.images_without_alt = sum(n["t"] == "Image" and not n["c"][1] for n in nodes)
    raw_html = sum(
        n["t"] in ("RawInline", "RawBlock") and n["c"][0] == "html" and not n["c"][1].lstrip().startswith("<!--")
        for n in nodes
    )
    if math:
        warnings.append(BrailleWarning(type="equation", detail=f"{math} equation(s) converted to linear text. Check them against Nemeth or UEB.", confidence="low"))
    if counts.tables:
        warnings.append(BrailleWarning(type="table", detail=f"{counts.tables} table(s) rewritten as one line per row. Check the reading order.", confidence="medium"))
    if counts.images_without_alt:
        warnings.append(BrailleWarning(type="image", detail=f"{counts.images_without_alt} image(s) have no alt text. Add a description before final approval.", confidence="low"))
    if raw_html:
        warnings.append(BrailleWarning(type="html", detail=f"{raw_html} raw HTML element(s) were left out. Check the page for missing content.", confidence="medium"))
    text = pypandoc.convert_text(
        ast, "plain", format="json", extra_args=["--wrap=none", f"--lua-filter={TABLES_FILTER}"]
    )
    return _ODD_SPACE_RE.sub(" ", text.replace("\r", "")), counts, warnings


def _paginate(brf: str) -> str:
    escapes = iter(_UNMAPPED_RE.findall(brf))
    lines: list[str] = []
    for paragraph in _UNMAPPED_RE.sub(_CELL_MARK, brf).split("\n"):
        lines.extend(textwrap.wrap(paragraph, CELLS_PER_LINE, drop_whitespace=False, break_long_words=True) or [""])
    pages = ["\r\n".join(lines[i : i + LINES_PER_PAGE]) for i in range(0, len(lines), LINES_PER_PAGE)]
    return re.sub(_CELL_MARK, lambda _: next(escapes), "\f".join(pages))


def build_braille(markdown: str, language: str) -> tuple[str, BrailleReport]:
    table = LANGUAGE_TABLES[language]
    text, counts, warnings = markdown_to_braille_text(markdown)
    tables = [DISPLAY_TABLE, table]
    louis.checkTable(tables)
    brf = "\n".join(str(louis.translateString(tables, line)) for line in text.split("\n"))
    unmapped = len(_UNMAPPED_RE.findall(brf))
    if unmapped:
        warnings.append(BrailleWarning(type="character", detail=f"{unmapped} character(s) have no braille cell in table {table}.", confidence="low"))
    report = BrailleReport(table=table, counts=counts, warnings=warnings, needs_review=bool(warnings))
    return _paginate(brf), report
