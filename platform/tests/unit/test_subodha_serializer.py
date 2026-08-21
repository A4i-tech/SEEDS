from __future__ import annotations

import pytest

from app.aggregators.models import (
    CanonicalNode,
    ItemType,
    NodeKind,
    QuizContent,
    TextContent,
    VideoContent,
)
from app.serializers.subodha_serializer import to_course_doc


class FakeBlob:
    def __init__(self, files: dict[str, bytes], sign_failures: set[str] | None = None):
        self._files = files
        self._sign_failures = sign_failures or set()

    async def download_from_url(self, blob_url: str) -> bytes:
        return self._files[blob_url]

    async def get_sas_url_from_blob_url(self, blob_url: str, expiry_hours: int = 1) -> str:
        if blob_url in self._sign_failures:
            raise RuntimeError("signing failed")
        return f"{blob_url}?sas=signed"


def _node(**overrides) -> CanonicalNode:
    base = {
        "source_type": "subodha", "root_id": "course-1", "order": 0,
        "content": None, "lms_url": None, "source_metadata": {}, "last_run_id": "run-1",
        "fetched_at": "2026-08-06T00:00:00Z", "created_at": "x", "updated_at": "x",
    }
    base.update(overrides)
    return CanonicalNode(**base)


def _nodes():
    course = _node(
        source_id="course-1", parent_id=None, node_kind=NodeKind.CONTAINER, item_type=None,
        display_name="Demo", native_type="course",
        source_metadata={"org": "edX", "course_number": "DemoX", "description": "", "language": "en",
                          "start": "2030-05-06T09:46:11+00:00", "pacing": "instructor", "hidden": False,
                          "invitation_only": False, "mobile_available": True, "content_hash": "abc123"},
    )
    chapter = _node(source_id="chapter-1", parent_id="course-1", node_kind=NodeKind.CONTAINER, item_type=None,
                    display_name="Intro", native_type="chapter")
    seq = _node(source_id="seq-1", parent_id="chapter-1", node_kind=NodeKind.CONTAINER, item_type=None,
                display_name="Lesson 1", native_type="sequential")
    vert = _node(source_id="vert-1", parent_id="seq-1", node_kind=NodeKind.CONTAINER, item_type=None,
                 display_name="Unit 1", native_type="vertical")
    html_item = _node(source_id="html-1", parent_id="vert-1", node_kind=NodeKind.ITEM, item_type=ItemType.TEXT,
                      display_name="Welcome", lms_url="https://lms/html-1", native_type="html",
                      content=TextContent(markdown_url="blob://x.md"))
    failed_item = _node(source_id="html-2", parent_id="vert-1", node_kind=NodeKind.ITEM, item_type=ItemType.TEXT,
                        display_name="Broken", lms_url="https://lms/html-2", native_type="html", order=2,
                        content=TextContent(raw_html_url="blob://x.raw.html", conversion_failed=True))
    video_item = _node(source_id="video-1", parent_id="vert-1", node_kind=NodeKind.ITEM, item_type=ItemType.VIDEO,
                       display_name="Intro video", lms_url="https://lms/video-1", native_type="video", order=1,
                       content=VideoContent(sources=["https://s3/v.mp4"], streams="1.00:abc", poster_url=None,
                                            transcript_languages={"en": "English"}))
    return [course, chapter, seq, vert, html_item, video_item, failed_item]


@pytest.mark.asyncio
async def test_to_course_doc_raises_clear_error_when_root_missing():
    blob = FakeBlob({})
    with pytest.raises(ValueError, match="no root node"):
        await to_course_doc(_nodes()[1:], blob)  # drop the root (parent_id is None) node


@pytest.mark.asyncio
async def test_to_course_doc_rebuilds_snake_case_shape():
    blob = FakeBlob({"blob://x.md": b"**Hi**", "blob://x.raw.html": b"<p>raw</p>"})
    doc = (await to_course_doc(_nodes(), blob)).to_dict()

    assert doc["source_id"] == "course-1"
    assert doc["source_type"] == "subodha"
    assert doc["content_hash"] == "abc123"
    assert doc["title"] == "Demo"
    assert doc["org"] == "edX"
    assert doc["language"] == "en"

    blocks_by_id = {b["block_id"]: b for b in doc["blocks"]}
    assert blocks_by_id["html-1"]["type"] == "html"
    assert blocks_by_id["html-1"]["markdown"] == "**Hi**"
    assert blocks_by_id["html-1"]["html"] == ""
    assert blocks_by_id["html-2"]["markdown"] is None
    assert blocks_by_id["html-2"]["html"] == "<p>raw</p>"
    assert blocks_by_id["video-1"]["type"] == "video"
    assert blocks_by_id["video-1"]["student_view_data"] == {
        "sources": ["https://s3/v.mp4"], "streams": "1.00:abc", "poster": None,
        "transcript_languages": {"en": "English"},
    }

    assert len(doc["outline"]) == 1
    chapter = doc["outline"][0]
    assert chapter["block_id"] == "chapter-1"
    assert chapter["sequentials"][0]["block_id"] == "seq-1"
    vertical = chapter["sequentials"][0]["verticals"][0]
    assert vertical["block_id"] == "vert-1"
    assert vertical["block_ids"] == ["html-1", "video-1", "html-2"]


@pytest.mark.asyncio
async def test_to_course_doc_passes_through_quiz_question_and_choices():
    quiz_item = _node(
        source_id="quiz-1", parent_id="vert-1", node_kind=NodeKind.ITEM, item_type=ItemType.QUIZ,
        display_name="Q1", lms_url="https://lms/quiz-1", native_type="problem", order=3,
        content=QuizContent(
            raw_html_url="blob://quiz-1.raw.html",
            question="Pick one",
            choices=[{"value": "a", "text": "A"}, {"value": "b", "text": "B"}],
        ),
    )
    blob = FakeBlob({"blob://x.md": b"**Hi**", "blob://x.raw.html": b"<p>raw</p>", "blob://quiz-1.raw.html": b"<div></div>"})
    doc = (await to_course_doc([*_nodes(), quiz_item], blob)).to_dict()

    quiz_block = next(b for b in doc["blocks"] if b["block_id"] == "quiz-1")
    assert quiz_block["question"] == "Pick one"
    assert quiz_block["choices"] == [{"value": "a", "text": "A"}, {"value": "b", "text": "B"}]


@pytest.mark.asyncio
async def test_to_course_doc_blocks_follow_document_order_not_input_order():
    """Each container's `order` resets to 0 for its own children, so two
    leaves under different parents can share the same `order` value. The
    flat `blocks` list must follow the true depth-first document order —
    not whatever order the input `nodes` list (e.g. a naive flat DB sort
    grouping by that colliding `order` field) happens to arrive in."""
    course = _node(
        source_id="course-1", parent_id=None, node_kind=NodeKind.CONTAINER, item_type=None,
        display_name="Demo", native_type="course",
        source_metadata={"org": "edX", "course_number": "DemoX", "description": "", "language": "en",
                          "start": "2030-05-06T09:46:11+00:00", "pacing": "instructor", "hidden": False,
                          "invitation_only": False, "mobile_available": True, "content_hash": "abc123"},
    )
    chapter_a = _node(source_id="chapter-a", parent_id="course-1", node_kind=NodeKind.CONTAINER, item_type=None,
                       display_name="A", native_type="chapter", order=0)
    seq_a = _node(source_id="seq-a", parent_id="chapter-a", node_kind=NodeKind.CONTAINER, item_type=None,
                  display_name="Seq A", native_type="sequential", order=0)
    vert_a = _node(source_id="vert-a", parent_id="seq-a", node_kind=NodeKind.CONTAINER, item_type=None,
                   display_name="Vert A", native_type="vertical", order=0)
    item_a = _node(source_id="item-a", parent_id="vert-a", node_kind=NodeKind.ITEM, item_type=ItemType.TEXT,
                   display_name="Item A", lms_url="https://lms/a", native_type="html", order=0,
                   content=TextContent(markdown_url="blob://a.md"))

    chapter_b = _node(source_id="chapter-b", parent_id="course-1", node_kind=NodeKind.CONTAINER, item_type=None,
                       display_name="B", native_type="chapter", order=1)
    seq_b = _node(source_id="seq-b", parent_id="chapter-b", node_kind=NodeKind.CONTAINER, item_type=None,
                  display_name="Seq B", native_type="sequential", order=0)
    vert_b = _node(source_id="vert-b", parent_id="seq-b", node_kind=NodeKind.CONTAINER, item_type=None,
                   display_name="Vert B", native_type="vertical", order=0)
    item_b = _node(source_id="item-b", parent_id="vert-b", node_kind=NodeKind.ITEM, item_type=ItemType.TEXT,
                   display_name="Item B", lms_url="https://lms/b", native_type="html", order=0,
                   content=TextContent(markdown_url="blob://b.md"))

    # Deliberately out of document order — both leaves share order=0, so a
    # flat sort on that field alone (the historical bug) can't tell them
    # apart and falls back to this arrival order, i.e. B before A.
    scrambled_nodes = [course, item_b, item_a, vert_b, vert_a, seq_b, seq_a, chapter_b, chapter_a]

    blob = FakeBlob({"blob://a.md": b"A", "blob://b.md": b"B"})
    doc = (await to_course_doc(scrambled_nodes, blob)).to_dict()

    assert [b["block_id"] for b in doc["blocks"]] == ["item-a", "item-b"]


@pytest.mark.asyncio
async def test_to_course_doc_signs_blob_image_urls_in_markdown():
    """The storage account has public access disabled, so every blob-hosted
    image referenced in markdown needs a fresh SAS token — otherwise the
    browser gets a PublicAccessNotPermitted error trying to load it."""
    course = _node(
        source_id="course-1", parent_id=None, node_kind=NodeKind.CONTAINER, item_type=None,
        display_name="Demo", native_type="course",
        source_metadata={"org": "edX", "course_number": "DemoX", "description": "", "language": "en",
                          "start": "2030-05-06T09:46:11+00:00", "pacing": "instructor", "hidden": False,
                          "invitation_only": False, "mobile_available": True, "content_hash": "abc123"},
    )
    chapter = _node(source_id="chapter-1", parent_id="course-1", node_kind=NodeKind.CONTAINER, item_type=None,
                    display_name="Intro", native_type="chapter")
    seq = _node(source_id="seq-1", parent_id="chapter-1", node_kind=NodeKind.CONTAINER, item_type=None,
                display_name="Lesson 1", native_type="sequential")
    vert = _node(source_id="vert-1", parent_id="seq-1", node_kind=NodeKind.CONTAINER, item_type=None,
                 display_name="Unit 1", native_type="vertical")
    html_item = _node(
        source_id="html-1", parent_id="vert-1", node_kind=NodeKind.ITEM, item_type=ItemType.TEXT,
        display_name="Welcome", lms_url="https://lms/html-1", native_type="html",
        content=TextContent(markdown_url="blob://x.md"),
    )
    markdown = (
        "Text before ![diagram](https://seedsstagingblob.blob.core.windows.net/subodha/courses/c1/assets/img.png) after."
    )
    blob = FakeBlob({"blob://x.md": markdown.encode("utf-8")})

    doc = (await to_course_doc([course, chapter, seq, vert, html_item], blob)).to_dict()

    resolved = doc["blocks"][0]["markdown"]
    assert "?sas=signed" in resolved
    assert "seedsstagingblob.blob.core.windows.net/subodha/courses/c1/assets/img.png?sas=signed" in resolved


@pytest.mark.asyncio
async def test_to_course_doc_leaves_image_url_untouched_if_signing_fails():
    course = _node(
        source_id="course-1", parent_id=None, node_kind=NodeKind.CONTAINER, item_type=None,
        display_name="Demo", native_type="course",
        source_metadata={"org": "edX", "course_number": "DemoX", "description": "", "language": "en",
                          "start": "2030-05-06T09:46:11+00:00", "pacing": "instructor", "hidden": False,
                          "invitation_only": False, "mobile_available": True, "content_hash": "abc123"},
    )
    chapter = _node(source_id="chapter-1", parent_id="course-1", node_kind=NodeKind.CONTAINER, item_type=None,
                    display_name="Intro", native_type="chapter")
    seq = _node(source_id="seq-1", parent_id="chapter-1", node_kind=NodeKind.CONTAINER, item_type=None,
                display_name="Lesson 1", native_type="sequential")
    vert = _node(source_id="vert-1", parent_id="seq-1", node_kind=NodeKind.CONTAINER, item_type=None,
                 display_name="Unit 1", native_type="vertical")
    image_url = "https://seedsstagingblob.blob.core.windows.net/subodha/courses/c1/assets/img.png"
    html_item = _node(
        source_id="html-1", parent_id="vert-1", node_kind=NodeKind.ITEM, item_type=ItemType.TEXT,
        display_name="Welcome", lms_url="https://lms/html-1", native_type="html",
        content=TextContent(markdown_url="blob://x.md"),
    )
    markdown = f"![diagram]({image_url})"
    blob = FakeBlob({"blob://x.md": markdown.encode("utf-8")}, sign_failures={image_url})

    doc = (await to_course_doc([course, chapter, seq, vert, html_item], blob)).to_dict()

    assert doc["blocks"][0]["markdown"] == markdown
