from __future__ import annotations

import asyncio
import json
import logging
import re
import tempfile
from pathlib import Path

from app.models.remediation_job import ARTIFACTS, AUTO_LANGUAGES, ArtifactName, artifact_filename
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.remediation.detect_language import language_name_to_code
from app.remediation.render import compile_docx_tex_pdf
from app.remediation.run_pipeline import run_pipeline

logger = logging.getLogger(__name__)

PIPELINE_PATH = Path(__file__).resolve().parent / "textbook_translation.yaml"
TRANSLATION_TIMEOUT_SECONDS = 60 * 60

_IMAGE_SRC_RE = re.compile(r"!\[[^\]]*\]\(([^)\s]+)")


def _repair_image_markup(original_md: str, translated_md: str) -> str:
    repaired = re.sub(r"\]\s+\(", "](", re.sub(r"!\s+\[", "![", translated_md))
    original_srcs = _IMAGE_SRC_RE.findall(original_md)
    translated_srcs = _IMAGE_SRC_RE.findall(repaired)
    if len(original_srcs) != len(translated_srcs):
        raise RuntimeError(
            f"Translation changed the number of figures from {len(original_srcs)} to {len(translated_srcs)}. "
            "Translate again. If it fails again, report the job id."
        )
    by_key = {src.lower(): src for src in original_srcs}

    def restore(m: re.Match) -> str:
        original = by_key.get(m.group(1).lower())
        if original is None:
            raise RuntimeError(
                f"Translation changed figure path {m.group(1)!r} to one not in the source. "
                "Translate again. If it fails again, report the job id."
            )
        return m.group(0)[: m.start(1) - m.start(0)] + original

    return _IMAGE_SRC_RE.sub(restore, repaired)


async def run_translation(
    job_id: str,
    remediated_path: Path,
    target_language: str,
    source_language: str,
    blob_provider: BlobStorageProvider,
) -> dict[str, str]:
    if not remediated_path.exists() or not remediated_path.read_bytes().strip():
        raise ValueError("Remediation produced no text to translate. Re-run remediation, then try translating again.")
    source = (source_language or "").strip()
    if source.lower() in (*AUTO_LANGUAGES, "", "unknown"):
        source = "auto"
    else:
        code = language_name_to_code(source)
        if code is None:
            raise ValueError(
                f"Source language {source_language!r} is not supported for translation. "
                "Pick a language from GET /v1/languages."
            )
        source = code

    with tempfile.TemporaryDirectory() as workspace:
        work = Path(workspace)
        context_path = work / "context.json"

        await run_pipeline(
            PIPELINE_PATH, remediated_path, work,
            [
                "--source-language", source,
                "--target-language", target_language,
                "--output", str(context_path),
            ],
            timeout=TRANSLATION_TIMEOUT_SECONDS,
        )

        ctx_data = json.loads(context_path.read_text(encoding="utf-8"))
        translated_text = str((ctx_data.get("metadata") or {}).get("translated_text") or "")
        if not translated_text:
            raise RuntimeError(
                "Translation produced no text. The source document had no extractable text. "
                "Re-run remediation, then try translating again."
            )

        translated_text = _repair_image_markup(remediated_path.read_text(encoding="utf-8"), translated_text)
        out_dir = work / "out"
        out_dir.mkdir()
        out_md = out_dir / artifact_filename(ArtifactName.TRANSLATED_MD)
        out_md.write_text(translated_text, encoding="utf-8")

        out_docx = out_dir / artifact_filename(ArtifactName.TRANSLATED_DOCX)
        out_tex = out_dir / artifact_filename(ArtifactName.TRANSLATED_TEX)

        def _compile() -> None:
            compile_docx_tex_pdf(translated_text, out_dir, out_docx, out_tex, resource_root=out_dir)

        await asyncio.to_thread(_compile)

        container = get_settings().azure_storage_container
        urls: dict[str, str] = {}
        for name, path in (
            ("translated_md", out_md),
            ("translated_docx", out_docx),
            ("translated_tex", out_tex),
            ("translated_pdf", out_dir / artifact_filename(ArtifactName.TRANSLATED_PDF)),
        ):
            if path.exists():
                with open(path, "rb") as fh:
                    urls[name] = await blob_provider.upload_file(
                        container, f"textbook-remediation/{job_id}/{path.name}", fh, ARTIFACTS[name][1]
                    )
        return urls
