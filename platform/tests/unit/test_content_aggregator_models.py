from __future__ import annotations

from app.aggregators.models import (
    AudioContent,
    BrailleContent,
    CanonicalNode,
    ItemType,
    NodeKind,
    content_dto_for_item_type,
)


def _node(**overrides) -> CanonicalNode:
    base = {
        "tenant_id": "tenant-a", "source_type": "partner", "source_id": "item-1", "root_id": "client-1",
        "parent_id": None, "order": 0, "node_kind": NodeKind.ITEM, "item_type": ItemType.AUDIO,
        "display_name": "Story One", "content": AudioContent(audio_url="https://blob/a.mp3"),
        "lms_url": None, "native_type": "audio", "source_metadata": {}, "last_run_id": "partner-push",
        "fetched_at": "x", "created_at": "x", "updated_at": "x",
    }
    base.update(overrides)
    return CanonicalNode(**base)


def test_canonical_node_defaults_client_id_and_is_deleted_when_omitted():
    node = _node()
    assert node.client_id == ""
    assert node.is_deleted is False
    assert node.deleted_at is None


def test_canonical_node_round_trips_partner_fields_through_doc():
    node = _node(client_id="client-1", is_deleted=True, deleted_at="2026-08-31T00:00:00+00:00")
    doc = node.to_doc()
    assert doc["client_id"] == "client-1"
    assert doc["is_deleted"] is True
    assert doc["deleted_at"] == "2026-08-31T00:00:00+00:00"

    restored = CanonicalNode.from_doc(doc)
    assert restored.client_id == "client-1"
    assert restored.is_deleted is True
    assert restored.deleted_at == "2026-08-31T00:00:00+00:00"


def test_canonical_node_omits_falsy_partner_fields_from_doc():
    node = _node()
    doc = node.to_doc()
    assert "client_id" not in doc
    assert "is_deleted" not in doc
    assert "deleted_at" not in doc


def test_from_doc_defaults_partner_fields_when_absent():
    node = _node()
    doc = node.to_doc()
    restored = CanonicalNode.from_doc(doc)
    assert restored.client_id == ""
    assert restored.is_deleted is False
    assert restored.deleted_at is None


def test_audio_content_round_trips():
    content = AudioContent(audio_url="https://blob/a.mp3")
    assert AudioContent.from_dict(content.to_dict()) == content


def test_braille_content_round_trips_with_grade():
    content = BrailleContent(brf_url="https://blob/b.brf", braille_grade=2)
    assert BrailleContent.from_dict(content.to_dict()) == content


def test_braille_content_defaults_grade_to_one():
    content = BrailleContent(brf_url="https://blob/b.brf")
    assert content.braille_grade == 1
    assert content.to_dict()["braille_grade"] == 1


def test_content_dto_for_item_type_covers_all_types():
    assert content_dto_for_item_type(ItemType.AUDIO) is AudioContent
    assert content_dto_for_item_type(ItemType.BRAILLE) is BrailleContent
