from __future__ import annotations

from app.aggregators.models import (
    CanonicalNode,
    DiscussionContent,
    ItemType,
    NodeKind,
    OtherContent,
    QuizContent,
    TextContent,
    VideoContent,
)


def test_text_content_round_trip_omits_unset_fields():
    content = TextContent(markdown_url="https://blob/x.md", html_url="https://blob/x.html")
    d = content.to_dict()
    assert d == {"markdown_url": "https://blob/x.md", "html_url": "https://blob/x.html"}
    assert TextContent.from_dict(d) == content


def test_text_content_fallback_shape():
    content = TextContent(raw_html_url="https://blob/x.raw.html", conversion_failed=True)
    d = content.to_dict()
    assert d == {"raw_html_url": "https://blob/x.raw.html", "conversion_failed": True}
    assert TextContent.from_dict(d) == content


def test_video_content_round_trip():
    content = VideoContent(sources=["https://s3/v.mp4"], streams="1.00:abc", poster_url=None, transcript_languages={"en": "English"})
    d = content.to_dict()
    assert VideoContent.from_dict(d) == content


def test_quiz_and_discussion_content_round_trip():
    quiz = QuizContent(raw_html_url="https://blob/q.raw.html", question="What is 2+2?", choices=[{"id": "a", "text": "4"}])
    assert QuizContent.from_dict(quiz.to_dict()) == quiz
    discussion = DiscussionContent(raw_html_url="https://blob/d.raw.html")
    assert DiscussionContent.from_dict(discussion.to_dict()) == discussion


def test_other_content_round_trip_is_free_form():
    other = OtherContent(payload={"whatever": "shape"})
    assert OtherContent.from_dict(other.to_dict()) == other


def test_canonical_node_to_doc_and_from_doc_round_trip():
    node = CanonicalNode(
        tenant_id="tenant-a", source_type="subodha", source_id="html-1", root_id="course-1",
        parent_id="vert-1", order=0, node_kind=NodeKind.ITEM, item_type=ItemType.MARKDOWN,
        display_name="Welcome", content=TextContent(markdown_url="https://blob/x.md", html_url="https://blob/x.html"),
        lms_url="https://lms/html-1", native_type="html", source_metadata={},
        last_run_id="run-1", fetched_at="2026-08-06T00:00:00Z",
        created_at="2026-08-06T00:00:00Z", updated_at="2026-08-06T00:00:00Z",
    )
    doc = node.to_doc()
    assert doc["node_kind"] == "item"
    assert doc["item_type"] == "markdown"
    assert doc["content"] == {"markdown_url": "https://blob/x.md", "html_url": "https://blob/x.html"}

    restored = CanonicalNode.from_doc(doc)
    assert restored == node


def test_canonical_node_container_has_no_content():
    node = CanonicalNode(
        tenant_id="tenant-a", source_type="subodha", source_id="course-1", root_id="course-1",
        parent_id=None, order=0, node_kind=NodeKind.CONTAINER, item_type=None,
        display_name="Demo", content=None, lms_url=None, native_type="course",
        source_metadata={"org": "edX"}, last_run_id="run-1", fetched_at="x", created_at="x", updated_at="x",
    )
    doc = node.to_doc()
    assert doc["content"] is None
    assert doc["item_type"] is None
    assert CanonicalNode.from_doc(doc) == node
