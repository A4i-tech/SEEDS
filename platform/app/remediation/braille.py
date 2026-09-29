from __future__ import annotations

import re
import textwrap
from pathlib import Path

import pypandoc

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
_TEX_MATH_RE = re.compile(r"\$(?!\s)[^$\n]*?(?<!\s)\$(?!\d)")
_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_HTML_TABLE_RE = re.compile(r"<table\b.*?</table>", re.DOTALL | re.IGNORECASE)
_PIPE_RULE_RE = re.compile(r"^[ \t]*\|?[ \t]*:?-+:?[ \t]*\|[ \t|:\-]*$", re.MULTILINE)
_EMPTY_ALT_RE = re.compile(r"!\[\s*\]\(")
_UNMAPPED_RE = re.compile(r"\\x[0-9a-fA-F]{4}")
_ODD_SPACE_RE = re.compile(r"[  -  ]")


def _warning(kind: str, detail: str, confidence: str) -> dict[str, str]:
    return {"type": kind, "detail": detail, "confidence": confidence}


def _html_table_to_markdown(match: re.Match[str]) -> str:
    return pypandoc.convert_text(match.group(0), "markdown", format="html")


def _prepare(markdown: str) -> tuple[str, dict[str, int], list[dict[str, str]]]:
    warnings: list[dict[str, str]] = []
    counts = {"equations": 0, "tables": 0, "images_without_alt": 0}

    def spoken(match: re.Match[str]) -> str:
        counts["equations"] += 1
        text = (match.group(1) or "").strip()
        if not text:
            warnings.append(_warning("equation", "MathML has no spoken form and was left out. Braille the equation by hand.", "low"))
            return "[Equation missing]"
        warnings.append(_warning("equation", f"Equation converted from its spoken form: {text[:80]}", "low"))
        return text

    body = _MATHML_RE.sub(spoken, markdown)
    body = _COMMENT_RE.sub("", _HTML_TABLE_RE.sub(_html_table_to_markdown, body))
    tex_equations = len(_TEX_MATH_RE.findall(body))
    if tex_equations:
        counts["equations"] += tex_equations
        warnings.append(_warning("equation", f"{tex_equations} inline equation(s) converted to linear text. Check them against Nemeth or UEB.", "low"))
    counts["tables"] = len(_PIPE_RULE_RE.findall(body))
    if counts["tables"]:
        warnings.append(_warning("table", f"{counts['tables']} table(s) rewritten as one line per row. Check the reading order.", "medium"))
    counts["images_without_alt"] = len(_EMPTY_ALT_RE.findall(body))
    if counts["images_without_alt"]:
        warnings.append(_warning("image", f"{counts['images_without_alt']} image(s) have no alt text. Add a description before final approval.", "low"))
    return body, counts, warnings


def markdown_to_braille_text(markdown: str) -> tuple[str, dict[str, int], list[dict[str, str]]]:
    body, counts, warnings = _prepare(markdown)
    text = pypandoc.convert_text(
        body,
        "plain",
        format="markdown+tex_math_dollars-raw_tex-raw_html-smart",
        extra_args=["--wrap=none", f"--lua-filter={TABLES_FILTER}"],
    )
    return _ODD_SPACE_RE.sub(" ", text.replace("\r", "")), counts, warnings


def _paginate(brf: str) -> str:
    lines: list[str] = []
    for paragraph in brf.split("\n"):
        lines.extend(textwrap.wrap(paragraph, CELLS_PER_LINE, drop_whitespace=False, break_long_words=True) or [""])
    pages = ["\r\n".join(lines[i : i + LINES_PER_PAGE]) for i in range(0, len(lines), LINES_PER_PAGE)]
    return "\f".join(pages)


def build_braille(markdown: str, language: str) -> tuple[str, dict[str, object]]:
    table = LANGUAGE_TABLES.get(language)
    if table is None:
        raise ValidationError(
            f"Braille is not available for language {language!r}. Supported languages: {sorted(LANGUAGE_TABLES)}."
        )
    import louis

    text, counts, warnings = markdown_to_braille_text(markdown)
    tables = [DISPLAY_TABLE, table]
    louis.checkTable(tables)
    brf = "\n".join(str(louis.translateString(tables, line)) for line in text.split("\n"))
    unmapped = len(_UNMAPPED_RE.findall(brf))
    if unmapped:
        warnings.append(_warning("character", f"{unmapped} character(s) have no braille cell in table {table}.", "low"))
    report: dict[str, object] = {"table": table, "counts": counts, "warnings": warnings, "needs_review": bool(warnings)}
    return _paginate(brf), report
