from __future__ import annotations

import pytest

pytest.importorskip("omni_ingest")

from app.remediation.detect_language import detect_language  # noqa: E402


def test_detect_language_identifies_indic_scripts():
    hindi_sample = "कबीर के दोहे बहुत प्रसिद्ध हैं। यह पाठ कक्षा 10 के लिए है।" * 5
    assert detect_language(hindi_sample) == "Hindi"

    tamil_sample = "தமிழ்நாடு அரசு பாடநூல் மற்றும் கல்வியியல் பணிகள் கழகம்" * 5
    assert detect_language(tamil_sample) == "Tamil"

    kannada_sample = "ಕರ್ನಾಟಕ ಸರ್ಕಾರ ಸಾರ್ವಜನಿಕ ಶಿಕ್ಷಣ ಇಲಾಖೆ" * 5
    assert detect_language(kannada_sample) == "Kannada"


def test_detect_language_identifies_english():
    english_sample = "Chapter 1: Nutrition in Plants. All living organisms require food."
    assert detect_language(english_sample) == "English"


def test_detect_language_handles_empty_or_whitespace():
    assert detect_language("") == "English"
    assert detect_language("   \n\t  ") == "English"


from app.remediation.render import render_remediation  # noqa: E402


def test_render_remediation_generates_all_artifacts(tmp_path):
    ctx = {
        "items": [
            {
                "id": "page-1",
                "content": "# Raw Heading\n\nSome text on page 1",
                "metadata": {
                    "kind": "page",
                    "page": 1,
                    "remediation": {
                        "blocks": [
                            {"type": "heading", "level": 1, "text": "Clean Heading"},
                            {"type": "paragraph", "text": "Accessible paragraph text"},
                            {"type": "figure", "image_id": "img-1", "text": ""},
                            {"type": "table", "header": ["Col A", "Col B"], "rows": [["1", "2"]]},
                        ],
                        "removed_artifacts": [{"kind": "page_number", "value": "1"}],
                    },
                    "verified": {
                        "corrections": [{"found": "teh", "corrected": "the", "fault": "other", "certain": True}],
                    },
                },
            },
            {
                "id": "img-1",
                "content": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "metadata": {
                    "kind": "image",
                    "page": 1,
                    "accessibility": {
                        "kind": "diagram",
                        "alt_text": "A simple pixel diagram",
                        "long_description": "Full explanation of the diagram.",
                        "observed_result": "Shows test diagram output",
                        "review_needed": False,
                    },
                },
            },
        ]
    }

    out_dir = tmp_path / "artifacts"
    res = render_remediation(ctx, out_dir)

    assert (out_dir / "raw.md").exists()
    assert (out_dir / "raw.corrected.remediated.md").exists()
    assert (out_dir / "raw.findings.jsonl").exists()
    assert (out_dir / "raw.alt.jsonl").exists()
    assert (out_dir / "raw.corrected.remediation.jsonl").exists()
    assert (out_dir / "remediated.unresolved.jsonl").exists()
    assert (out_dir / "remediated.docx").exists()
    assert (out_dir / "remediated.tex").exists()
    assert (out_dir / "remediated.tex").read_text(encoding="utf-8").startswith("\\DocumentMetadata{tagged=true}")
    import shutil

    if shutil.which("soffice") or shutil.which("libreoffice"):
        assert (out_dir / "remediated.pdf").exists()

    md_content = (out_dir / "raw.corrected.remediated.md").read_text(encoding="utf-8")
    assert "# Clean Heading" in md_content
    assert "![A simple pixel diagram](images/" in md_content
    assert "| Col A | Col B |" in md_content

    assert res["pages"] == 1
    assert res["figures"] == 1
    assert res["findings"] == 1


class _StubBlob:
    def __init__(self):
        self.uploaded: dict[str, bytes] = {}

    async def upload_file(self, container, blob_name, data, content_type):
        self.uploaded[blob_name] = data
        return f"https://blob/{blob_name}"


@pytest.mark.asyncio
async def test_run_translation_uploads_translated_artifacts(monkeypatch):
    import json

    import app.remediation.translate as translate_mod

    translated = "translated heading and body"

    async def fake_run_pipeline(pipeline_path, resource, workspace, options, on_progress=None, timeout=None):
        (workspace / "context.json").write_text(
            json.dumps({"metadata": {"translated_text": translated}}), encoding="utf-8"
        )

    def fake_compile(markdown, out_dir, out_docx, out_tex, resource_root=None):
        out_docx.write_bytes(b"stub-docx")
        out_tex.write_bytes(b"stub-tex")
        pdf_path = out_dir / "translated.pdf"
        pdf_path.write_bytes(b"stub-pdf")
        return pdf_path

    monkeypatch.setattr(translate_mod, "run_pipeline", fake_run_pipeline)
    monkeypatch.setattr(translate_mod, "compile_docx_tex_pdf", fake_compile)

    blob = _StubBlob()
    urls = await translate_mod.run_translation(
        "job-1", b"original heading and body", "hi", "en", blob
    )

    assert set(urls) == {"translated_md", "translated_docx", "translated_tex", "translated_pdf"}
    assert blob.uploaded["textbook-remediation/job-1/translated.md"].decode("utf-8").strip() == translated


@pytest.mark.asyncio
async def test_run_translation_maps_source_language_name_to_code(monkeypatch):
    import json

    import app.remediation.translate as translate_mod

    captured_options = {}

    async def fake_run_pipeline(pipeline_path, resource, workspace, options, on_progress=None, timeout=None):
        captured_options["options"] = options
        (workspace / "context.json").write_text(
            json.dumps({"metadata": {"translated_text": "x"}}), encoding="utf-8"
        )

    monkeypatch.setattr(translate_mod, "run_pipeline", fake_run_pipeline)
    monkeypatch.setattr(translate_mod, "compile_docx_tex_pdf", lambda *a, **k: None)

    await translate_mod.run_translation("job-1", b"hi", "kn", "Hindi", _StubBlob())
    options = captured_options["options"]
    assert options[options.index("--source-language") + 1] == "hi"

    await translate_mod.run_translation("job-1", b"hi", "kn", "auto", _StubBlob())
    options = captured_options["options"]
    assert options[options.index("--source-language") + 1] == "auto"

    with pytest.raises(ValueError, match="not supported for translation"):
        await translate_mod.run_translation("job-1", b"hi", "kn", "Klingon", _StubBlob())


@pytest.mark.asyncio
async def test_run_translation_raises_clear_error_when_no_text(monkeypatch):
    import json

    import app.remediation.translate as translate_mod

    async def fake_run_pipeline(pipeline_path, resource, workspace, options, on_progress=None, timeout=None):
        (workspace / "context.json").write_text(
            json.dumps({"metadata": {"translated_text": None}}), encoding="utf-8"
        )

    monkeypatch.setattr(translate_mod, "run_pipeline", fake_run_pipeline)

    with pytest.raises(ValueError, match="no text to translate"):
        await translate_mod.run_translation("job-1", b"  \n", "hi", "en", _StubBlob())
    with pytest.raises(RuntimeError, match="no extractable text"):
        await translate_mod.run_translation("job-1", b"# text", "hi", "en", _StubBlob())


@pytest.mark.asyncio
async def test_translate_agent_translates_figure_accessibility(monkeypatch):
    import uuid
    from unittest.mock import AsyncMock

    from omni_ingest.agent.enrichment import TranslateAgent
    from omni_ingest.core.model import KnowledgeItem, ResolvedResource, StepStatus
    from omni_ingest.core.pipeline import IngestionContext

    mock_translator = AsyncMock()
    mock_translator.translate = AsyncMock(
        return_value={
            "kind": "figure",
            "alt_text": "परीक्षण चित्र",
            "long_description": "परीक्षण विस्तृत विवरण",
        }
    )

    class MockContextManager:
        async def __aenter__(self):
            return mock_translator

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr("omni_ingest.agent.enrichment.create_translator", lambda *args, **kwargs: MockContextManager())

    ctx = IngestionContext(
        resource=ResolvedResource(uri="", raw_content=b""),
        metadata={
            "accessibility": {
                "kind": "figure",
                "alt_text": "Test diagram",
                "long_description": "Test description",
            },
        },
        items=[
            KnowledgeItem(
                id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
                raw_content=b"img_bytes",
                metadata={"kind": "image"},
            )
        ],
    )

    agent = TranslateAgent(
        src=None,
        dst="hi",
        input=".metadata.accessibility",
        path=".metadata.accessibility",
    )
    result = await agent.run(ctx)
    assert result.status == StepStatus.SUCCESS
    assert ctx.metadata["accessibility"]["alt_text"] == "परीक्षण चित्र"


