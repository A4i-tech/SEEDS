from __future__ import annotations

import asyncio
import base64
import sys
import time

import pytest

from app.remediation import render
from app.remediation.detect_language import normalize_language_name

_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def test_as_jpeg_returns_truthful_extension_for_real_images():
    import pymupdf

    data, ext = render.as_jpeg(_PNG)
    assert ext == "jpg"
    assert data[:3] == b"\xff\xd8\xff"

    pix = pymupdf.Pixmap(_PNG)
    if pix.alpha:
        pix = pymupdf.Pixmap(pix, 0)
    jpeg = pix.tobytes("jpeg")
    data, ext = render.as_jpeg(jpeg)
    assert ext == "jpg"
    assert data[:3] == b"\xff\xd8\xff"


def test_as_jpeg_sniffs_format_when_conversion_fails(monkeypatch):
    import pymupdf

    def boom(*args, **kwargs):
        raise RuntimeError("cannot decode")

    monkeypatch.setattr(pymupdf, "Pixmap", boom)

    assert render.as_jpeg(b"\x89PNG\r\n\x1a\nrest")[1] == "png"
    assert render.as_jpeg(b"\xff\xd8\xff\xe0rest")[1] == "jpg"
    assert render.as_jpeg(b"GIF89a-rest")[1] == "gif"
    assert render.as_jpeg(b"RIFF\x00\x00\x00\x00WEBPrest")[1] == "webp"


def test_as_jpeg_refuses_to_mislabel_unknown_bytes(monkeypatch):
    import pymupdf

    def boom(*args, **kwargs):
        raise RuntimeError("cannot decode")

    monkeypatch.setattr(pymupdf, "Pixmap", boom)

    with pytest.raises(RuntimeError):
        render.as_jpeg(b"definitely-not-an-image")


def test_normalize_language_name_matches_whole_tokens_only():
    assert normalize_language_name("korean") != "Odia"
    assert normalize_language_name("Korean") != "Odia"
    assert normalize_language_name("chinese") != "Hindi"
    assert normalize_language_name("Origin") != "Odia"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("Tamil", "Tamil"),
        ("हिन्दी", "Hindi"),
        ("ta", "Tamil"),
        ("kn", "Kannada"),
        ("or", "Odia"),
        ("odia", "Odia"),
        ("বাংলা", "Bengali"),
    ],
)
def test_normalize_language_name_resolves_real_names(value, expected):
    assert normalize_language_name(value) == expected


def test_markdown_to_format_passes_standalone_and_resource_path(monkeypatch, tmp_path):
    captured: dict[str, object] = {}

    def fake_convert(text, to, format, outputfile, extra_args=None):
        captured.update(text=text, to=to, format=format, outputfile=outputfile, extra_args=extra_args)

    monkeypatch.setattr(render.pypandoc, "convert_text", fake_convert)

    root = tmp_path / "assets"
    ref = tmp_path / "ref.docx"
    render.markdown_to_format("# Title", "docx", tmp_path / "out.docx", resource_root=root, reference_docx=ref)

    assert captured["text"] == "# Title"
    assert captured["to"] == "docx"
    assert captured["format"] == "markdown+tex_math_dollars-raw_tex-raw_html"
    assert "--standalone" in captured["extra_args"]
    assert f"--resource-path={root}" in captured["extra_args"]
    assert f"--reference-doc={ref}" in captured["extra_args"]


def test_markdown_to_format_omits_resource_path_when_absent(monkeypatch, tmp_path):
    captured: dict[str, object] = {}

    def fake_convert(text, to, format, outputfile, extra_args=None):
        captured["extra_args"] = extra_args

    monkeypatch.setattr(render.pypandoc, "convert_text", fake_convert)
    render.markdown_to_format("x", "latex", tmp_path / "out.tex")

    assert captured["extra_args"] == ["--standalone"]


def test_render_remediation_raises_and_removes_docx_on_pandoc_failure(monkeypatch, tmp_path):
    def boom(*args, **kwargs):
        raise RuntimeError("pandoc broke")

    monkeypatch.setattr(render.pypandoc, "convert_text", boom)

    ctx = {
        "items": [
            {
                "id": "page-1",
                "content": "Some text",
                "metadata": {
                    "kind": "page",
                    "page": 1,
                    "remediation": {"blocks": [{"type": "paragraph", "text": "Body"}]},
                },
            }
        ]
    }

    out_dir = tmp_path / "artifacts"
    with pytest.raises(RuntimeError, match="DOCX compilation failed"):
        render.render_remediation(ctx, out_dir)

    assert not (out_dir / "remediated.docx").exists()


async def _run_sleeping_pipeline(tmp_path, monkeypatch, **kwargs):
    import app.remediation.run_pipeline as pipeline_mod

    started: dict[str, object] = {}
    real_exec = asyncio.create_subprocess_exec

    class _Settings:
        openai_api_key = ""
        groq_api_key = ""
        mistral_ocr_api_key = ""
        mistral_ocr_endpoint = ""
        mistral_ocr_model = ""
        azure_openai_api_key = ""
        azure_openai_endpoint = ""
        openai_api_version = ""
        default_chat_completion_model = ""
        azure_translation_key = ""
        azure_translation_region = ""

    monkeypatch.setattr(pipeline_mod, "get_settings", lambda: _Settings())

    async def fake_exec(*args, **exec_kwargs):
        proc = await real_exec(sys.executable, "-c", "import time; time.sleep(30)", **exec_kwargs)
        started["proc"] = proc
        return proc

    monkeypatch.setattr(pipeline_mod.asyncio, "create_subprocess_exec", fake_exec)

    task = asyncio.ensure_future(
        pipeline_mod.run_pipeline(tmp_path / "pipeline.yaml", tmp_path / "in.txt", tmp_path, [], **kwargs)
    )
    for _ in range(200):
        if "proc" in started:
            break
        await asyncio.sleep(0.05)
    assert "proc" in started, "child process never started"
    return task, started


@pytest.mark.asyncio
async def test_run_pipeline_kills_child_on_cancellation(tmp_path, monkeypatch):
    task, started = await _run_sleeping_pipeline(tmp_path, monkeypatch, timeout=30)

    start = time.monotonic()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert started["proc"].returncode is not None
    assert time.monotonic() - start < 5


@pytest.mark.asyncio
async def test_run_pipeline_kills_child_on_timeout(tmp_path, monkeypatch):
    task, started = await _run_sleeping_pipeline(tmp_path, monkeypatch, timeout=0.3)

    start = time.monotonic()
    with pytest.raises(RuntimeError, match="timed out"):
        await task

    assert started["proc"].returncode is not None
    assert time.monotonic() - start < 5


def test_figure_block_with_mangled_id_uses_next_unused_page_figure():
    figures = {
        "fig-a": {"page": 1, "src": "images/a.png", "alt_text": "A"},
        "fig-b": {"page": 1, "src": "images/b.png", "alt_text": "B"},
    }
    builder = render._MarkdownBuilder(figures, [], [])
    builder.emit_block_figure(1, "fig- b")
    builder.emit_block_figure(1, "garbled-id")
    builder.emit_page_figures(1)

    assert builder.body("") == "![B](images/b.png)\n\n![A](images/a.png)\n"


def test_page_without_ocr_text_drops_invented_text_blocks():
    corpus = render._Corpus()
    corpus.raw_pages.append((1, "<image\nid='a'/>\n\n<image id='b'/>"))
    corpus.pages.append((1, {"blocks": [
        {"type": "heading", "level": 1, "text": "Physical Quantities"},
        {"type": "paragraph", "text": "Invented body"},
    ]}))

    body = render._build_remediated_body(corpus, [], "")

    assert "Physical Quantities" not in body
    assert corpus.unresolved_records[0]["type"] == "invented_text"
