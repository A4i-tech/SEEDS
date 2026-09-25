from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from pathlib import Path

from app.models.remediation_job import ARTIFACTS, ArtifactName, artifact_filename
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.remediation.render import compile_docx_tex_pdf
from app.remediation.run_pipeline import run_pipeline

logger = logging.getLogger(__name__)

PIPELINE_PATH = Path(__file__).resolve().parent / "textbook_translation.yaml"
TRANSLATION_TIMEOUT_SECONDS = 60 * 60


async def run_translation(
    job_id: str,
    remediated_path: Path,
    target_language: str,
    source_language: str,
    blob_provider: BlobStorageProvider,
) -> dict[str, str]:
    with tempfile.TemporaryDirectory() as workspace:
        work = Path(workspace)
        context_path = work / "context.json"

        await run_pipeline(
            PIPELINE_PATH, remediated_path, work,
            [
                "--source-language", source_language or "auto",
                "--target-language", target_language,
                "--output", str(context_path),
            ],
            timeout=TRANSLATION_TIMEOUT_SECONDS,
        )

        ctx_data = json.loads(context_path.read_text(encoding="utf-8"))
        translated_text = str((ctx_data.get("metadata") or {}).get("translated_text") or "")
        if not translated_text:
            raise RuntimeError("Translation pipeline produced no text")

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
