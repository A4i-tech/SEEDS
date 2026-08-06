from __future__ import annotations

from app.aggregators.models import ItemType, NodeKind
from app.aggregators.subodha_adapter import SubodhaAdapter

COURSE = {
    "id": "course-v1:edX+DemoX+Demo_Course", "name": "Demo", "org": "edX", "number": "DemoX",
    "short_description": "", "language": "en", "start": "2030-05-06T09:46:11+00:00",
    "pacing": "instructor", "hidden": False, "invitation_only": False, "mobile_available": True,
}

BLOCKS_RESPONSE = {
    "root": "course",
    "blocks": {
        "course": {"type": "course", "display_name": "Demo", "children": ["chapter-1"]},
        "chapter-1": {"type": "chapter", "display_name": "Intro", "children": ["seq-1"]},
        "seq-1": {"type": "sequential", "display_name": "Lesson 1", "children": ["vert-1"]},
        "vert-1": {"type": "vertical", "display_name": "Unit 1", "children": ["html-1", "video-1"]},
        "html-1": {"type": "html", "display_name": "Welcome", "student_view_html": "<p>Hi</p>",
                   "student_view_data": None, "lms_web_url": "https://lms/html-1"},
        "video-1": {"type": "video", "display_name": "Intro video", "student_view_html": "",
                    "student_view_data": {"sources": ["https://s3/v.mp4"]}, "lms_web_url": "https://lms/video-1"},
    },
}

adapter = SubodhaAdapter()


def test_is_empty_true_for_no_content_blocks():
    assert adapter.is_empty({"root": "course", "blocks": {"course": {"type": "course", "children": []}}}) is True


def test_is_empty_false_when_content_block_present():
    assert adapter.is_empty(BLOCKS_RESPONSE) is False


def test_build_canonical_nodes_reconstructs_hierarchy():
    nodes = adapter.build_canonical_nodes(COURSE, BLOCKS_RESPONSE, "run-1", {})
    by_id = {n.source_id: n for n in nodes}

    course_node = by_id["course-v1:edX+DemoX+Demo_Course"]
    assert course_node.node_kind == NodeKind.CONTAINER
    assert course_node.parent_id is None
    assert course_node.native_type == "course"
    assert course_node.source_metadata["org"] == "edX"

    chapter_node = by_id["chapter-1"]
    assert chapter_node.parent_id == "course-v1:edX+DemoX+Demo_Course"
    assert chapter_node.native_type == "chapter"

    html_node = by_id["html-1"]
    assert html_node.node_kind == NodeKind.ITEM
    assert html_node.item_type == ItemType.TEXT
    assert html_node.parent_id == "vert-1"
    assert html_node.raw == "<p>Hi</p>"
    assert html_node.content is None
    assert html_node.native_type == "html"

    video_node = by_id["video-1"]
    assert video_node.item_type == ItemType.VIDEO
    assert video_node.raw == {"sources": ["https://s3/v.mp4"]}


def test_compute_content_hash_stable_for_same_input_changes_when_raw_changes():
    nodes_a = adapter.build_canonical_nodes(COURSE, BLOCKS_RESPONSE, "run-1", {})
    nodes_b = adapter.build_canonical_nodes(COURSE, BLOCKS_RESPONSE, "run-2", {})
    assert adapter.compute_content_hash(nodes_a) == adapter.compute_content_hash(nodes_b)

    changed = dict(BLOCKS_RESPONSE)
    changed["blocks"] = {**BLOCKS_RESPONSE["blocks"], "html-1": {**BLOCKS_RESPONSE["blocks"]["html-1"], "student_view_html": "<p>Changed</p>"}}
    nodes_c = adapter.build_canonical_nodes(COURSE, changed, "run-1", {})
    assert adapter.compute_content_hash(nodes_a) != adapter.compute_content_hash(nodes_c)
