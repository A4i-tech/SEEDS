"""Runs textbook_translation.yaml against an already-remediated Markdown
document and uploads the translated md/docx/tex/pdf as job artifacts.

Shared by two trigger points, both calling this same function:
  - the consumer, right after the main remediation pipeline finishes, when
    the job was created with translate_when="start"
  - the controller's /jobs/{job_id}/translate endpoint, for a job the
    reviewer wants translated after the fact ("once done")
"""
from __future__ import annotations

import json
import logging
import tempfile
from pathlib import Path

import pypandoc

from app.models.remediation_job import ARTIFACTS
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.remediation.render import convert_docx_to_pdf, tag_tex_for_pdf_ua
from app.remediation.run_pipeline import run_pipeline

logger = logging.getLogger(__name__)

PIPELINE_PATH = Path(__file__).resolve().parent / "textbook_translation.yaml"


async def run_translation(
    job_id: str,
    remediated_md: bytes,
    target_language: str,
    source_language: str,
    blob_provider: BlobStorageProvider,
) -> dict[str, str]:
    with tempfile.TemporaryDirectory() as workspace:
        work = Path(workspace)
        md_path = work / "remediated.md"
        md_path.write_bytes(remediated_md)
        context_path = work / "context.json"

        await run_pipeline(
            PIPELINE_PATH, md_path, work,
            [
                "--source-language", source_language or "auto",
                "--target-language", target_language,
                "--output", str(context_path),
            ],
        )

        ctx_data = json.loads(context_path.read_text(encoding="utf-8"))
        translated_text = str((ctx_data.get("metadata") or {}).get("translated_text") or "")
        if not translated_text:
            raise RuntimeError("Translation pipeline produced no text")

        out_dir = work / "out"
        out_dir.mkdir()
        out_md = out_dir / "translated.md"
        out_md.write_text(translated_text, encoding="utf-8")

        out_docx = out_dir / "translated.docx"
        pypandoc.convert_text(
            translated_text, "docx", format="markdown+tex_math_dollars",
            outputfile=str(out_docx), extra_args=["--standalone"],
        )
        out_tex = out_dir / "translated.tex"
        pypandoc.convert_text(
            translated_text, "latex", format="markdown+tex_math_dollars",
            outputfile=str(out_tex), extra_args=["--standalone"],
        )
        tag_tex_for_pdf_ua(out_tex)
        if out_docx.exists() and out_docx.stat().st_size > 0:
            convert_docx_to_pdf(out_docx, out_dir)

        container = get_settings().azure_storage_container
        urls: dict[str, str] = {}
        for name, path in (
            ("translated_md", out_md),
            ("translated_docx", out_docx),
            ("translated_tex", out_tex),
            ("translated_pdf", out_dir / "translated.pdf"),
        ):
            if path.exists():
                urls[name] = await blob_provider.upload_file(
                    container, f"textbook-remediation/{job_id}/{path.name}", path.read_bytes(), ARTIFACTS[name][1]
                )
        return urls
