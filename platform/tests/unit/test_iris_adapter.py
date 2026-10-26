from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.aggregators.iris_adapter import IrisAdapter
from app.aggregators.iris_types import IrisBook, IrisTactile
from app.aggregators.models import ItemType, NodeKind

_BOOK = IrisBook(book_id="101", name="Book", tactile_ids=["22", "25"])


def _t(tactile_id="22", language_id="1", content=None, audio=None, title="Title") -> IrisTactile:
    return IrisTactile(
        tactile_id=tactile_id, language_id=language_id, title_english="T", title=title,
        content=content if content is not None else {"name_1": "Head", "desc_1": "a"},
        author_id="9", is_poster="0",
        audio_urls=audio if audio is not None else [f"https://cdn.example/101/{tactile_id}/{language_id}/1/desc.mp3"],
    )


def test_is_empty():
    assert IrisAdapter().is_empty([]) is True
    assert IrisAdapter().is_empty([_t()]) is False


def test_build_tree_shape():
    nodes = IrisAdapter().build_canonical_nodes(_BOOK, [_t("22"), _t("25")], "run1")
    containers = [n for n in nodes if n.node_kind == NodeKind.CONTAINER]
    items = [n for n in nodes if n.node_kind == NodeKind.ITEM]
    assert [c.source_id for c in containers] == ["101", "101/c", "101/c/s", "101/c/s/v"]
    assert containers[0].parent_id is None and containers[0].native_type == "book"
    assert [i.source_id for i in items] == ["101/t22/l1", "101/t25/l1"]
    assert all(i.parent_id == "101/c/s/v" and i.item_type == ItemType.PLAINTEXT for i in items)


def test_item_text_lists_labels_in_numeric_order():
    t = _t(content={"name_2": "Face", "desc_2": "b", "name_1": "Head", "desc_1": "a"}, title="Title")
    node = IrisAdapter().build_canonical_nodes(_BOOK, [t], "r")[-1]
    assert node.raw == "Title\n\nHead: a\nFace: b"


def test_audio_urls_stored_as_given():
    url = "https://cdn.example/101/22/1/1/desc.mp3"
    node = IrisAdapter().build_canonical_nodes(_BOOK, [_t(audio=[url])], "r")[-1]
    assert node.source_metadata["audio_urls"] == [url]


def test_audio_urls_empty_when_none_given():
    node = IrisAdapter().build_canonical_nodes(_BOOK, [_t(audio=[])], "r")[-1]
    assert node.source_metadata["audio_urls"] == []


@pytest.mark.parametrize(
    "url",
    ["http://cdn.example/x.mp3", "/101/22/1/1/desc.mp3", "https://u:p@cdn.example/x.mp3", "ftp://cdn.example/x.mp3"],
)
def test_audio_url_validation(url):
    with pytest.raises(ValidationError):
        _t(audio=[url])


def test_language_stored_raw():
    node = IrisAdapter().build_canonical_nodes(_BOOK, [_t(language_id="11")], "r")[-1]
    assert node.source_id == "101/t22/l11"
    assert node.source_metadata["language"] == "11"


def test_content_hash_changes_when_label_text_changes_and_is_stable():
    a = IrisAdapter()
    first = a.build_canonical_nodes(_BOOK, [_t()], "r1")
    again = a.build_canonical_nodes(_BOOK, [_t()], "r2")
    changed = a.build_canonical_nodes(_BOOK, [_t(content={"name_1": "Head", "desc_1": "z"})], "r3")
    assert a.compute_content_hash(first) == a.compute_content_hash(again)
    assert a.compute_content_hash(first) != a.compute_content_hash(changed)
