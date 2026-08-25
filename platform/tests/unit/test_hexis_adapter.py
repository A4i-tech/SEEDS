from __future__ import annotations

from app.aggregators.hexis_adapter import HexisAdapter, to_iso_639_1
from app.aggregators.models import ItemType, NodeKind


def test_language_maps_to_iso_from_name_int_and_hex():
    assert to_iso_639_1("English") == "en"
    assert to_iso_639_1("1") == "en"
    assert to_iso_639_1("8") == "bn"
    assert to_iso_639_1("0xa") == "or"
    assert to_iso_639_1(None) is None


def test_is_empty():
    assert HexisAdapter().is_empty([]) is True
    assert HexisAdapter().is_empty([{"actual_content": "  "}]) is True
    assert HexisAdapter().is_empty([{"actual_content": "hi"}]) is False


def _subject():
    return {"subject_id": "3", "name": "Science"}


def test_build_tree_shape_and_item_mapping():
    items = [
        {"cid": "15950", "title": "NEWS WEEK 16", "class": "8", "language": "1", "subject": "3",
         "ctype": "2", "actual_content": "body text", "folder": "news", "common_content": "1", "author_id": "241"},
        {"cid": "42", "title": "Quiz", "class": "8", "language": "8", "subject": "3",
         "ctype": "3", "actual_content": '{"question":"2+2?","a1":"3","a2":"4","a3":"5","ca":2}',
         "folder": "mcq", "common_content": "0", "author_id": "241"},
    ]
    nodes = HexisAdapter().build_canonical_nodes(_subject(), items, "run1", {})

    root = next(n for n in nodes if n.parent_id is None)
    assert root.source_id == "3" and root.native_type == "subject"
    assert root.display_name == "Science"

    container_types = {n.native_type for n in nodes if n.node_kind == NodeKind.CONTAINER}
    assert {"subject", "class", "folder", "vertical"} <= container_types

    story = next(n for n in nodes if n.source_id == "15950")
    assert story.item_type == ItemType.PLAINTEXT
    assert story.raw == "body text"
    assert story.source_metadata["language"] == "en"
    assert story.source_metadata["author_id"] == "241"

    quiz = next(n for n in nodes if n.source_id == "42")
    assert quiz.item_type == ItemType.QUIZ
    assert quiz.raw == {"question": "2+2?", "a1": "3", "a2": "4", "a3": "5", "ca": 2}
    assert quiz.source_metadata["language"] == "bn"


def test_content_hash_stable_across_rebuilds():
    items = [{"cid": "1", "title": "A", "class": "5", "language": "1", "subject": "3", "ctype": "2",
              "actual_content": "x", "folder": "f", "common_content": "0"}]
    adapter = HexisAdapter()
    h1 = adapter.compute_content_hash(adapter.build_canonical_nodes(_subject(), items, "r1", {}))
    h2 = adapter.compute_content_hash(adapter.build_canonical_nodes(_subject(), items, "r2", {}))
    assert h1 == h2
