from __future__ import annotations

import base64
import hashlib
import html
import json
import logging
import re
import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf
import pypandoc
import pypdf

from app.models.remediation_job import ArtifactName, artifact_filename

logger = logging.getLogger(__name__)


def md_table(header: list[str], rows: list[list[str]]) -> str:
    if not any(str(cell or "").strip() for cell in header):
        return html_table([], rows)
    lines = [
        "| " + " | ".join(str(c).replace("|", "\\|") for c in header) + " |",
        "| " + " | ".join("---" for _ in header) + " |",
    ]
    for row in rows:
        padded = list(row) + [""] * (len(header) - len(row))
        lines.append("| " + " | ".join(str(c).replace("|", "\\|") for c in padded[: len(header)]) + " |")
    return "\n".join(lines)


def html_table(header: list[str], rows: list[list[str]]) -> str:
    head = f"<thead><tr>{''.join(f'<th>{html.escape(str(c))}</th>' for c in header)}</tr></thead>" if header else ""
    body = "".join("<tr>" + "".join(f"<td>{html.escape(str(c))}</td>" for c in row) + "</tr>" for row in rows)
    return f'<table border="1">{head}<tbody>{body}</tbody></table>'


def _sniff_image_ext(raw: bytes) -> str | None:
    if raw[:3] == b"\xff\xd8\xff":
        return "jpg"
    if raw[:4] == b"\x89PNG":
        return "png"
    if raw[:3] == b"GIF":
        return "gif"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp"
    return None


def as_jpeg(raw: bytes) -> tuple[bytes, str]:
    try:
        pix = pymupdf.Pixmap(raw)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        return pix.tobytes("jpeg", jpg_quality=85), "jpg"
    except Exception:
        ext = _sniff_image_ext(raw)
        if ext is None:
            logger.error("Unrecognized image format (%d bytes); refusing to mislabel it", len(raw))
            raise
        return raw, ext


def markdown_to_format(
    text: str,
    to: str,
    out_path: Path,
    resource_root: Path | None = None,
    reference_docx: Path | None = None,
) -> None:
    extra_args = ["--standalone"]
    if resource_root is not None:
        extra_args.append(f"--resource-path={resource_root}")
    if reference_docx is not None:
        extra_args.append(f"--reference-doc={reference_docx}")
    pypandoc.convert_text(
        text,
        to,
        format="markdown+tex_math_dollars-raw_tex-raw_html",
        outputfile=str(out_path),
        extra_args=extra_args,
    )


_UNSAFE_LATEX_RE = re.compile(r"\\(input|include|write18)\b[^\n]*")
_IMAGE_MARKER = re.compile(r"<image\b[^>]*>")


def _scrub_latex_commands(text: str) -> str:
    return _UNSAFE_LATEX_RE.sub("", text)


def tag_tex_for_pdf_ua(tex_path: Path) -> None:
    if not tex_path.exists():
        return
    body = tex_path.read_text(encoding="utf-8")
    tex_path.write_text("\\DocumentMetadata{tagged=true}\n" + body, encoding="utf-8")


_PDF_UA_FILTER = (
    'pdf:writer_pdf_Export:{"UseTaggedPDF":{"type":"boolean","value":"true"},'
    '"PDFUACompliance":{"type":"boolean","value":"true"}}'
)


def _pdf_is_tagged(pdf_path: Path) -> bool:
    mark_info = pypdf.PdfReader(str(pdf_path)).trailer["/Root"].get("/MarkInfo")
    return bool(mark_info and mark_info.get("/Marked"))


def convert_docx_to_pdf(docx_path: Path, out_dir: Path) -> Path | None:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        logger.warning("LibreOffice not found on PATH; no .pdf artifact for %s", docx_path)
        return None
    proc = subprocess.Popen(
        [soffice, "--headless", "--convert-to", _PDF_UA_FILTER, "--outdir", str(out_dir), str(docx_path)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    try:
        _, stderr = proc.communicate(timeout=120)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        logger.warning("PDF compilation timed out; no .pdf artifact for %s", docx_path)
        return None
    if proc.returncode != 0:
        logger.warning("PDF compilation failed; no .pdf artifact for %s: %s", docx_path, stderr.decode("utf-8", "replace"))
        return None
    pdf_path = out_dir / f"{docx_path.stem}.pdf"
    if not pdf_path.exists():
        return None
    try:
        tagged = _pdf_is_tagged(pdf_path)
    except Exception as exc:
        logger.error("Could not verify PDF/UA tagging on %s; rejecting it: %s", pdf_path, exc)
        pdf_path.unlink(missing_ok=True)
        return None
    if not tagged:
        logger.error("PDF/UA tagging did not apply to %s; rejecting the untagged PDF", pdf_path)
        pdf_path.unlink(missing_ok=True)
        return None
    return pdf_path


def compile_docx_tex_pdf(
    text: str,
    out_dir: Path,
    docx_path: Path,
    tex_path: Path,
    *,
    resource_root: Path | None = None,
    catch_errors: bool = False,
) -> Path | None:
    try:
        markdown_to_format(text, "docx", docx_path, resource_root=resource_root)
    except Exception as exc:
        if not catch_errors:
            raise
        docx_path.unlink(missing_ok=True)
        raise RuntimeError(f"DOCX compilation failed: {exc}") from exc

    try:
        markdown_to_format(text, "latex", tex_path, resource_root=resource_root)
        tag_tex_for_pdf_ua(tex_path)
    except Exception as exc:
        if not catch_errors:
            raise
        logger.warning("LaTeX compilation failed; no .tex artifact for this run: %s", exc)
        tex_path.unlink(missing_ok=True)

    if docx_path.exists() and docx_path.stat().st_size > 0:
        return convert_docx_to_pdf(docx_path, out_dir)
    return None


@dataclass
class _Corpus:
    figures: dict[str, dict[str, object]] = field(default_factory=dict)
    pages: list[tuple[int, dict[str, object]]] = field(default_factory=list)
    raw_pages: list[tuple[int, str]] = field(default_factory=list)
    findings_records: list[dict[str, object]] = field(default_factory=list)
    alt_records: list[dict[str, object]] = field(default_factory=list)
    unresolved_records: list[dict[str, object]] = field(default_factory=list)


def _collect_image(
    item: dict[str, object], meta: dict[str, object], page_num: int, images_dir: Path, corpus: _Corpus
) -> None:
    content_b64 = item.get("content")
    raw_bytes = base64.b64decode(str(content_b64)) if content_b64 else b""
    data, ext = as_jpeg(raw_bytes)

    access = meta.get("accessibility") or {}

    item_id = str(item.get("id") or "")
    fname = f"{hashlib.md5(raw_bytes).hexdigest()[:12]}_{page_num}_img.{ext}"
    (images_dir / fname).write_bytes(data)

    fig_data: dict[str, object] = {
        "file": fname,
        "image_name": fname,
        "src": f"images/{fname}",
        "page": page_num,
        "kind": access.get("kind", "figure"),
        "alt_text": access.get("alt_text", ""),
        "long_description": access.get("long_description", ""),
        "observed_result": access.get("observed_result", ""),
        "visible_labels": access.get("visible_labels", []),
        "confidence": access.get("confidence", 1.0),
        "review_needed": bool(access.get("review_needed", False)),
        "review_reason": access.get("review_reason", ""),
    }
    corpus.figures[item_id] = fig_data
    corpus.alt_records.append(
        {
            "id": item_id,
            "page": page_num,
            "image_name": fname,
            "alt_text": fig_data["alt_text"],
            "long_description": fig_data["long_description"],
            "observed_result": fig_data["observed_result"],
            "status": "described" if not fig_data["review_needed"] else "needs_check",
        }
    )
    if fig_data["review_needed"]:
        corpus.unresolved_records.append(
            {
                "id": item_id,
                "page": page_num,
                "type": "unresolved_figure",
                "text": fig_data["alt_text"],
                "reason": fig_data["review_reason"] or "Needs manual check",
                "needs_check": True,
            }
        )


def _collect_page(
    item: dict[str, object], meta: dict[str, object], page_num: int, corpus: _Corpus
) -> None:
    raw_text = str(item.get("content") or "")
    if raw_text and item.get("content_encoding") != "base64":
        corpus.raw_pages.append((page_num, raw_text))

    rem = meta.get("remediation")
    if rem:
        corpus.pages.append((page_num, rem))

    ver = meta.get("verified") or {}
    for corr in ver.get("corrections") or []:
        corpus.findings_records.append({"page": page_num, **corr})


def _collect_corpus(ctx: dict[str, object], images_dir: Path) -> _Corpus:
    corpus = _Corpus()
    for item in ctx.get("items", []):
        meta = item.get("metadata") or {}
        page_num = int(meta.get("page") or 1)
        if meta.get("kind") == "image":
            _collect_image(item, meta, page_num, images_dir, corpus)
        else:
            _collect_page(item, meta, page_num, corpus)
    corpus.raw_pages.sort(key=lambda p: p[0])
    corpus.pages.sort(key=lambda p: p[0])
    return corpus


class _MarkdownBuilder:
    def __init__(
        self,
        figures: dict[str, dict[str, object]],
        remediation_records: list[dict[str, object]],
        unresolved_records: list[dict[str, object]],
    ) -> None:
        self._figures = figures
        self._remediation_records = remediation_records
        self._unresolved_records = unresolved_records
        self._used_figures: set[str] = set()
        self._blocks: list[str] = []

    def emit_figure(self, figure_id: str) -> None:
        fig = self._figures.get(figure_id)
        if not fig or figure_id in self._used_figures or fig.get("kind") == "decorative":
            return
        self._used_figures.add(figure_id)
        alt = str(fig.get("alt_text") or "").strip()
        long_desc = str(fig.get("long_description") or "").strip().replace("\n", " ").replace('"', "'")
        title = f' "{long_desc}"' if long_desc else ""
        self._blocks.append(f"![{alt}]({fig['src']}{title})")

    def emit_block_figure(self, page_num: int, image_id: str) -> None:
        figure_id = "".join(image_id.split())
        if figure_id not in self._figures or figure_id in self._used_figures:
            figure_id = next(
                (
                    fid for fid, fig in self._figures.items()
                    if fig["page"] == page_num and fid not in self._used_figures and fig.get("kind") != "decorative"
                ),
                "",
            )
        if not figure_id:
            self._unresolved_records.append({
                "page": page_num,
                "type": "missing_figure",
                "text": image_id,
                "reason": "The page text refers to a figure that was not extracted from the PDF. Check the page image.",
                "needs_check": True,
            })
        self.emit_figure(figure_id)

    def start_page(self, page_num: int) -> None:
        self._blocks.append(f"<!-- page {page_num} -->")

    def append(self, text: str) -> None:
        self._blocks.append(text)

    def add_removed_artifact(self, page_num: int, artifact: dict[str, object]) -> None:
        self._remediation_records.append({"page": page_num, "rule": "removed_artifact", **artifact})

    def add_remediation_record(self, record: dict[str, object]) -> None:
        self._remediation_records.append(record)

    def render_block(self, page_num: int, block: dict[str, object]) -> None:
        b_text = str(block.get("text") or "").strip()
        if block.get("review_needed"):
            self._unresolved_records.append(
                {
                    "page": page_num,
                    "type": block.get("type"),
                    "text": b_text,
                    "reason": block.get("review_reason") or "Flagged in review",
                    "needs_check": True,
                }
            )
        renderer = BLOCK_RENDERERS.get(str(block.get("type") or ""))
        if renderer is not None:
            renderer(self, page_num, block, b_text)
        elif b_text:
            self._blocks.append(b_text)

    def emit_page_figures(self, page_num: int) -> None:
        for figure_id, fig in self._figures.items():
            if fig["page"] == page_num and figure_id not in self._used_figures and fig.get("kind") != "decorative":
                self.emit_figure(figure_id)

    def emit_remaining_figures(self) -> None:
        for figure_id in self._figures:
            if figure_id not in self._used_figures:
                self.emit_figure(figure_id)

    def body(self, fallback: str) -> str:
        return "\n\n".join(self._blocks) + "\n" if self._blocks else fallback + "\n"


def _render_heading(builder: _MarkdownBuilder, page_num: int, block: dict[str, object], b_text: str) -> None:
    if b_text:
        level = min(6, int(block.get("level") or 1))
        builder.append("#" * level + " " + b_text)


def _render_list(builder: _MarkdownBuilder, page_num: int, block: dict[str, object], b_text: str) -> None:
    items = block.get("items") or []
    if items:
        builder.append("\n".join(f"- {str(i)}" for i in items))
    elif b_text:
        builder.append(b_text)


def _render_table(builder: _MarkdownBuilder, page_num: int, block: dict[str, object], b_text: str) -> None:
    header = [str(c) for c in (block.get("header") or [])]
    rows = [[str(c) for c in row] for row in (block.get("rows") or [])]
    builder.add_remediation_record({"page": page_num, "rule": "table_summary", "rows": len(rows)})
    if rows:
        builder.append(md_table(header, rows))
    else:
        builder.append("> Table structure found, cells unreadable. Needs manual entry.")


def _render_math(builder: _MarkdownBuilder, page_num: int, block: dict[str, object], b_text: str) -> None:
    mathml = str(block.get("mathml") or "").strip()
    spoken = str(block.get("spoken") or "").strip()
    if mathml.startswith("<math"):
        builder.append(mathml)
        if spoken:
            builder.append(f"<!-- spoken: {spoken} -->")
    elif spoken:
        builder.append(spoken)


def _render_figure(builder: _MarkdownBuilder, page_num: int, block: dict[str, object], b_text: str) -> None:
    builder.emit_block_figure(page_num, str(block.get("image_id") or ""))
    if b_text:
        builder.append(b_text)


BLOCK_RENDERERS: dict[str, Callable[[_MarkdownBuilder, int, dict[str, object], str], None]] = {
    "heading": _render_heading,
    "list": _render_list,
    "table": _render_table,
    "math": _render_math,
    "figure": _render_figure,
}


def _build_remediated_body(corpus: _Corpus, remediation_records: list[dict[str, object]], fallback: str) -> str:
    builder = _MarkdownBuilder(corpus.figures, remediation_records, corpus.unresolved_records)
    raw_by_page = dict(corpus.raw_pages)
    for page_num, rem in corpus.pages:
        builder.start_page(page_num)
        for artifact in rem.get("removed_artifacts") or []:
            if isinstance(artifact, dict):
                builder.add_removed_artifact(page_num, artifact)
        blocks = [b for b in rem.get("blocks") or [] if isinstance(b, dict)]
        if not _IMAGE_MARKER.sub("", raw_by_page.get(page_num, "")).strip():
            dropped = [b for b in blocks if b.get("type") != "figure" and str(b.get("text") or "").strip()]
            if dropped:
                corpus.unresolved_records.append({
                    "page": page_num,
                    "type": "invented_text",
                    "text": str(dropped[0].get("text"))[:200],
                    "reason": "OCR found no text on this page, so the generated text was removed. Check the page image.",
                    "needs_check": True,
                })
            blocks = [b for b in blocks if b.get("type") == "figure"]
        for block in blocks:
            builder.render_block(page_num, block)
        builder.emit_page_figures(page_num)
    builder.emit_remaining_figures()
    return builder.body(fallback)


def _raw_body(corpus: _Corpus) -> str:
    return "\n\n".join(
        f"<!-- page {p} -->\n\n{text.strip()}" for p, text in corpus.raw_pages if text.strip()
    )


def _write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")


def _write_trails(out_dir: Path, corpus: _Corpus, remediation_records: list[dict[str, object]]) -> None:
    _write_jsonl(out_dir / artifact_filename(ArtifactName.FINDINGS), corpus.findings_records)
    _write_jsonl(out_dir / artifact_filename(ArtifactName.ALT), corpus.alt_records)
    _write_jsonl(out_dir / artifact_filename(ArtifactName.REMEDIATION), remediation_records)
    _write_jsonl(out_dir / artifact_filename(ArtifactName.UNRESOLVED), corpus.unresolved_records)


def _compile_artifacts(out_dir: Path, body: str) -> None:
    body = _scrub_latex_commands(body)
    docx_path = out_dir / artifact_filename(ArtifactName.DOCX)
    tex_path = out_dir / artifact_filename(ArtifactName.TEX)
    compile_docx_tex_pdf(body, out_dir, docx_path, tex_path, resource_root=out_dir, catch_errors=True)


def _metrics(corpus: _Corpus, remediation_records: list[dict[str, object]]) -> dict[str, object]:
    total_pages = max(len(corpus.pages), len(corpus.raw_pages), 1)
    return {
        "total_pages": total_pages,
        "processed_pages": total_pages,
        "diagrams_described": len(corpus.alt_records),
        "tables_fixed": len([r for r in remediation_records if r.get("rule") == "table_summary"]),
        "flagged_items_count": len(corpus.unresolved_records),
    }


def render_remediation(ctx: dict[str, object], out_dir: Path) -> dict[str, object]:
    out_dir.mkdir(parents=True, exist_ok=True)
    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    corpus = _collect_corpus(ctx, images_dir)
    raw_body = _raw_body(corpus)
    (out_dir / artifact_filename(ArtifactName.RAW)).write_text(raw_body + "\n", encoding="utf-8")

    remediation_records: list[dict[str, object]] = []
    remediated_body = _build_remediated_body(corpus, remediation_records, raw_body)
    (out_dir / artifact_filename(ArtifactName.REMEDIATED)).write_text(remediated_body, encoding="utf-8")
    (out_dir / artifact_filename(ArtifactName.CORRECTED)).write_text(remediated_body, encoding="utf-8")

    _write_trails(out_dir, corpus, remediation_records)
    _compile_artifacts(out_dir, remediated_body)

    total_pages = max(len(corpus.pages), len(corpus.raw_pages), 1)
    return {
        "metrics": _metrics(corpus, remediation_records),
        "pages": total_pages,
        "figures": len(corpus.figures),
        "findings": len(corpus.findings_records),
        "unresolved": len(corpus.unresolved_records),
    }
