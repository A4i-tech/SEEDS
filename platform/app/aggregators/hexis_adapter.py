"""HexisAdapter — concrete SourceAdapter for the Hexis/Antara LMS.

Hexis content is a flat list of items. This builds a synthetic
subject -> class -> folder -> vertical -> item tree (one tree per subject) so
the shared serializer and the frontend outline viewer (which expect
chapter/sequential/vertical tiers) work unchanged. Item nodes carry their raw
payload on a plain `.raw` attribute until SourceAdapter.process_nodes() runs a
ContentStrategy.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, ClassVar

from app.aggregators.base_adapter import SourceAdapter
from app.aggregators.models import CanonicalNode, ItemType, NodeKind

_ISO_BY_CODE = {1: "en", 2: "hi", 3: "ta", 4: "te", 5: "kn", 6: "ml", 7: "mr", 8: "bn", 9: "gu", 10: "or"}
_ISO_BY_NAME = {
    "english": "en", "hindi": "hi", "tamil": "ta", "telugu": "te", "kannada": "kn",
    "malayalam": "ml", "marathi": "mr", "bengali": "bn", "gujarati": "gu", "odia": "or",
}
_CTYPE_ITEM = {"1": ItemType.PLAINTEXT, "2": ItemType.PLAINTEXT, "3": ItemType.QUIZ}
_CTYPE_NATIVE = {"1": "notes", "2": "story", "3": "mcq"}


def to_iso_639_1(value: str | int | None) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    if s.lower() in _ISO_BY_NAME:
        return _ISO_BY_NAME[s.lower()]
    try:
        return _ISO_BY_CODE.get(int(s, 0), s)
    except ValueError:
        return s


def _body(item: dict[str, Any]) -> str:
    return item.get("actual_content") or item.get("content") or ""


def _mcq(item: dict[str, Any]) -> dict[str, Any]:
    body = _body(item)
    if isinstance(body, dict):
        return body
    try:
        parsed = json.loads(body)
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


def _now() -> str:
    return datetime.now(UTC).isoformat()


class HexisAdapter(SourceAdapter):
    source_type: ClassVar[str] = "hexis"

    def is_empty(self, items: list[dict[str, Any]] | None) -> bool:
        return not items or not any(str(_body(i)).strip() for i in items)

    def build_canonical_nodes(
        self, native_subject: dict[str, Any], native_items: list[dict[str, Any]], run_id: str, url_map: dict[str, str]
    ) -> list[CanonicalNode]:
        subject = str(native_subject["subject_id"])
        now = _now()

        def make(sid, parent, order, kind, itype, name, native, raw=None, meta=None) -> CanonicalNode:
            node = CanonicalNode(
                tenant_id="", source_type=self.source_type, source_id=sid, root_id=subject,
                parent_id=parent, order=order, node_kind=kind, item_type=itype,
                display_name=name, content=None, lms_url=None, native_type=native,
                source_metadata=meta or {}, last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
            )
            if raw is not None:
                node.raw = raw
            return node

        subject_name = native_subject.get("name") or (f"Subject {subject}" if subject else "Unclassified")
        nodes = [
            make(subject, None, 0, NodeKind.CONTAINER, None, subject_name, "subject",
                 meta={"subject": subject, "subject_name": subject_name})
        ]

        by_class: dict[str, dict[str, list[dict[str, Any]]]] = {}
        for it in native_items:
            cls = str(it.get("class") or "")
            folder = str(it.get("folder") or "")
            by_class.setdefault(cls, {}).setdefault(folder, []).append(it)

        for cls_order, (cls, folders) in enumerate(by_class.items()):
            cls_id = f"{subject}/c{cls}"
            nodes.append(make(cls_id, subject, cls_order, NodeKind.CONTAINER, None,
                              f"Class {cls}" if cls else "Unclassified", "class"))
            for folder_order, (folder, items) in enumerate(folders.items()):
                folder_id = f"{cls_id}/{folder or 'misc'}"
                folder_name = folder or "misc"
                nodes.append(make(folder_id, cls_id, folder_order, NodeKind.CONTAINER, None, folder_name, "folder"))
                vert_id = f"{folder_id}/v"
                nodes.append(make(vert_id, folder_id, 0, NodeKind.CONTAINER, None, folder_name, "vertical"))
                for item_order, it in enumerate(items):
                    ctype = str(it.get("ctype") or "2")
                    item_type = _CTYPE_ITEM.get(ctype, ItemType.PLAINTEXT)
                    raw = _mcq(it) if item_type == ItemType.QUIZ else _body(it)
                    nodes.append(make(
                        str(it["cid"]), vert_id, item_order, NodeKind.ITEM, item_type,
                        it.get("title") or "", _CTYPE_NATIVE.get(ctype, "story"), raw=raw,
                        meta={
                            "folder": folder, "class": cls,
                            "language": to_iso_639_1(it.get("language")),
                            "common_content": it.get("common_content"),
                            "author_id": it.get("author_id"),
                        },
                    ))
        return nodes
