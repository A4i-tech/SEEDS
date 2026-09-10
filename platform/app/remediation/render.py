"""Render OmniIngest accessibility remediation context into SEEDS textbook artifacts.

Mirrors render() in Seeds-omniingest/accessibility/remediate.py.
Takes the JSON context dump from the textbook_remediation.yaml pipeline and emits:
    - raw.md                                  initial OCR text
    - raw.corrected.remediated.md             remediated accessible Markdown
    - raw.findings.jsonl                      OCR corrections trail
    - raw.alt.jsonl                           figure descriptions trail
    - raw.corrected.remediation.jsonl         removed artifacts & table summary trail
    - remediated.unresolved.jsonl             flagged/unresolved items trail
    - images/<md5>_<page>_img.jpg             extracted figure crops
    - remediated.docx                         compiled Word document with embedded figures
"""
from __future__ import annotations

import base64
import hashlib
import html
import json
from pathlib import Path

import pypandoc


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


def as_jpeg(raw: bytes) -> tuple[bytes, str]:
    try:
        import pymupdf

        pix = pymupdf.Pixmap(raw)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        return pix.tobytes("jpeg", jpg_quality=85), "jpg"
    except Exception:
        return raw, "png"


def render_remediation(ctx: dict[str, object], out_dir: Path) -> dict[str, object]:
    out_dir.mkdir(parents=True, exist_ok=True)
    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    items: list[dict[str, object]] = [
        it for it in ctx.get("items", []) if isinstance(it, dict)
    ]
    figures: dict[str, dict[str, object]] = {}
    pages: list[tuple[int, dict[str, object], dict[str, object]]] = []
    raw_pages: list[tuple[int, str]] = []

    findings_records: list[dict[str, object]] = []
    alt_records: list[dict[str, object]] = []
    remediation_records: list[dict[str, object]] = []
    unresolved_records: list[dict[str, object]] = []

    for item in items:
        meta = item.get("metadata") or {}
        if not isinstance(meta, dict):
            meta = {}
        kind = meta.get("kind")
        page_num = int(meta.get("page") or 1)

        if kind == "image":
            content_b64 = item.get("content")
            raw_bytes = base64.b64decode(str(content_b64)) if content_b64 else b""
            data, ext = as_jpeg(raw_bytes)
            access = meta.get("accessibility") or {}
            if not isinstance(access, dict):
                access = {}

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
            figures[item_id] = fig_data
            alt_records.append(
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
                unresolved_records.append(
                    {
                        "id": item_id,
                        "page": page_num,
                        "type": "unresolved_figure",
                        "text": fig_data["alt_text"],
                        "reason": fig_data["review_reason"] or "Needs manual check",
                        "needs_check": True,
                    }
                )
        else:
            raw_text = str(item.get("content") or "")
            if raw_text and item.get("content_encoding") != "base64":
                raw_pages.append((page_num, raw_text))

            rem = meta.get("remediation")
            ver = meta.get("verified") or {}
            if isinstance(rem, dict):
                pages.append((page_num, rem, ver if isinstance(ver, dict) else {}))

            if isinstance(ver, dict):
                for corr in ver.get("corrections") or []:
                    if isinstance(corr, dict):
                        findings_records.append({"page": page_num, **corr})

    # 1. raw.md
    raw_pages.sort(key=lambda p: p[0])
    raw_body = "\n\n".join(
        f"<!-- page {p} -->\n\n{text.strip()}" for p, text in raw_pages if text.strip()
    )
    (out_dir / "raw.md").write_text(raw_body + "\n", encoding="utf-8")

    # 2. remediated.md from blocks
    md_blocks: list[str] = []
    used_figures: set[str] = set()

    def emit_figure(fid: str) -> None:
        fig = figures.get(fid)
        if not fig or fid in used_figures:
            return
        used_figures.add(fid)
        alt = str(fig.get("alt_text") or "Figure").strip()
        md_blocks.append(f"![{alt}]({fig['src']})")
        if fig.get("long_description"):
            md_blocks.append(f"<!-- long description: {fig['long_description']} -->")

    pages.sort(key=lambda p: p[0])
    for page_num, rem, _ver in pages:
        md_blocks.append(f"<!-- page {page_num} -->")

        for artifact in rem.get("removed_artifacts") or []:
            if isinstance(artifact, dict):
                remediation_records.append({"page": page_num, "rule": "removed_artifact", **artifact})

        for block in rem.get("blocks") or []:
            if not isinstance(block, dict):
                continue
            b_type = block.get("type")
            b_text = str(block.get("text") or "").strip()
            level = min(6, int(block.get("level") or 1))

            if block.get("review_needed"):
                unresolved_records.append(
                    {
                        "page": page_num,
                        "type": b_type,
                        "text": b_text,
                        "reason": block.get("review_reason") or "Flagged in review",
                        "needs_check": True,
                    }
                )

            if b_type == "heading" and b_text:
                md_blocks.append("#" * level + " " + b_text)
            elif b_type == "list" and block.get("items"):
                items_list = [str(i) for i in block.get("items", [])]
                md_blocks.append("\n".join(f"- {i}" for i in items_list))
            elif b_type == "table":
                header = [str(c) for c in (block.get("header") or [])]
                rows = [[str(c) for c in row] for row in (block.get("rows") or [])]
                remediation_records.append({"page": page_num, "rule": "table_summary", "rows": len(rows)})
                if rows:
                    md_blocks.append(md_table(header, rows))
                else:
                    md_blocks.append("> Table structure found, cells unreadable. Needs manual entry.")
            elif b_type == "math":
                mathml = str(block.get("mathml") or "").strip()
                spoken = str(block.get("spoken") or "").strip()
                if mathml.startswith("<math"):
                    md_blocks.append(mathml)
                    if spoken:
                        md_blocks.append(f"<!-- spoken: {spoken} -->")
                elif spoken:
                    md_blocks.append(spoken)
            elif b_type == "figure":
                emit_figure(str(block.get("image_id") or ""))
                if b_text:
                    md_blocks.append(b_text)
            elif b_text:
                md_blocks.append(b_text)

        for fid, fig in figures.items():
            if fig["page"] == page_num and fid not in used_figures and fig.get("kind") != "decorative":
                emit_figure(fid)

    for fid, _fig in figures.items():
        if fid not in used_figures:
            emit_figure(fid)

    remediated_body = "\n\n".join(md_blocks) + "\n" if md_blocks else raw_body + "\n"
    (out_dir / "raw.corrected.remediated.md").write_text(remediated_body, encoding="utf-8")
    (out_dir / "raw.corrected.md").write_text(remediated_body, encoding="utf-8")

    # 3. JSONL trails
    (out_dir / "raw.findings.jsonl").write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in findings_records), encoding="utf-8"
    )
    (out_dir / "raw.alt.jsonl").write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in alt_records), encoding="utf-8"
    )
    (out_dir / "raw.corrected.remediation.jsonl").write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in remediation_records), encoding="utf-8"
    )
    (out_dir / "remediated.unresolved.jsonl").write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in unresolved_records), encoding="utf-8"
    )

    # 4. remediated.docx
    docx_path = out_dir / "remediated.docx"
    try:
        pypandoc.convert_text(
            remediated_body,
            "docx",
            format="markdown+tex_math_dollars",
            outputfile=str(docx_path),
            extra_args=["--standalone", f"--resource-path={out_dir}"],
        )
    except Exception:
        docx_path.write_bytes(b"")

    total_pages = max(len(pages), len(raw_pages), 1)
    metrics: dict[str, object] = {
        "total_pages": total_pages,
        "processed_pages": total_pages,
        "diagrams_described": len(alt_records),
        "tables_fixed": len([r for r in remediation_records if r.get("rule") == "table_summary"]),
        "flagged_items_count": len(unresolved_records),
    }

    return {
        "metrics": metrics,
        "pages": total_pages,
        "figures": len(figures),
        "findings": len(findings_records),
        "unresolved": len(unresolved_records),
    }
