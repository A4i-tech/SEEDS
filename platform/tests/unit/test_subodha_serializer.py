from __future__ import annotations

import pytest

from app.aggregators.models import CanonicalNode, ItemType, NodeKind, TextContent, VideoContent
from app.serializers.subodha_serializer import to_course_doc


class FakeBlob:
    def __init__(self, files: dict[str, bytes]):
        self._files = files

    async def download_from_url(self, blob_url: str) -> bytes:
        return self._files[blob_url]


def _node(**overrides) -> CanonicalNode:
    base = dict(
        tenant_id="tenant-a", source_type="subodha", root_id="course-1", order=0,
        content=None, lms_url=None, source_metadata={}, last_run_id="run-1",
        fetched_at="2026-08-06T00:00:00Z", created_at="x", updated_at="x",
    )
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
                      content=TextContent(html_url="blob://x.html"))
    video_item = _node(source_id="video-1", parent_id="vert-1", node_kind=NodeKind.ITEM, item_type=ItemType.VIDEO,
                       display_name="Intro video", lms_url="https://lms/video-1", native_type="video", order=1,
                       content=VideoContent(sources=["https://s3/v.mp4"], streams="1.00:abc", poster_url=None,
                                            transcript_languages={"en": "English"}))
    return [course, chapter, seq, vert, html_item, video_item]


@pytest.mark.asyncio
async def test_to_course_doc_rebuilds_snake_case_shape():
    blob = FakeBlob({"blob://x.html": b"<p>Hi</p>"})
    doc = (await to_course_doc(_nodes(), blob)).to_dict()

    assert doc["source_id"] == "course-1"
    assert doc["source_type"] == "subodha"
    assert doc["content_hash"] == "abc123"
    assert doc["title"] == "Demo"
    assert doc["org"] == "edX"
    assert doc["language"] == "en"

    blocks_by_id = {b["block_id"]: b for b in doc["blocks"]}
    assert blocks_by_id["html-1"]["type"] == "html"
    assert blocks_by_id["html-1"]["html"] == "<p>Hi</p>"
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
    assert vertical["block_ids"] == ["html-1", "video-1"]
