from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime
from typing import ClassVar

from app.aggregators.base_adapter import SourceAdapter
from app.aggregators.hexis_types import HexisContentItem, HexisContentType, HexisMcq, HexisSubject
from app.aggregators.models import CanonicalNode, ItemType, NodeKind, RawItemPayload, SourceType

_ISO_BY_CODE = {1: "en", 2: "hi", 3: "ta", 4: "te", 5: "kn", 6: "ml", 7: "mr", 8: "bn", 9: "gu", 10: "or"}
_ISO_BY_NAME = {
    "english": "en", "hindi": "hi", "tamil": "ta", "telugu": "te", "kannada": "kn",
    "malayalam": "ml", "marathi": "mr", "bengali": "bn", "gujarati": "gu", "odia": "or",
}
_CTYPE_ITEM = {
    HexisContentType.NOTES: ItemType.PLAINTEXT,
    HexisContentType.STORY: ItemType.PLAINTEXT,
    HexisContentType.MCQ: ItemType.QUIZ,
}
_CTYPE_NATIVE = {
    HexisContentType.NOTES: "notes",
    HexisContentType.STORY: "story",
    HexisContentType.MCQ: "mcq",
}


def to_iso_639_1(value: str | int) -> str:
    s = str(value).strip()
    if s.lower() in _ISO_BY_NAME:
        return _ISO_BY_NAME[s.lower()]
    try:
        return _ISO_BY_CODE.get(int(s, 0), s)
    except ValueError:
        return s


def _body(item: HexisContentItem) -> str:
    return item.get("actual_content") or item.get("content") or ""


def _mcq(item: HexisContentItem) -> HexisMcq:
    return json.loads(_body(item))


def _now() -> str:
    return datetime.now(UTC).isoformat()


class HexisAdapter(SourceAdapter):
    source_type: ClassVar[SourceType] = SourceType.HEXIS

    def is_empty(self, items: list[HexisContentItem]) -> bool:
        return not any(str(_body(i)).strip() for i in items)

    def build_canonical_nodes(
        self, native_subject: HexisSubject, native_items: list[HexisContentItem], run_id: str
    ) -> list[CanonicalNode]:
        subject = native_subject.subject_id
        now = _now()

        def make(
            sid: str,
            parent: str | None,
            order: int,
            kind: NodeKind,
            itype: ItemType | None,
            name: str,
            native: str,
            raw: RawItemPayload = "",
            meta: dict[str, object] | None = None,
        ) -> CanonicalNode:
            node = CanonicalNode(
                source_type=self.source_type, source_id=sid, root_id=subject,
                parent_id=parent, order=order, node_kind=kind, item_type=itype,
                display_name=name, content=None, lms_url="", native_type=native,
                source_metadata=meta or {}, last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
            )
            node.raw = raw
            return node

        nodes = [
            make(subject, None, 0, NodeKind.CONTAINER, None, native_subject.name, "subject",
                 meta={"subject": subject, "subject_name": native_subject.name})
        ]

        by_class: dict[str, dict[str, list[HexisContentItem]]] = defaultdict(lambda: defaultdict(list))
        for it in native_items:
            by_class[it.get("class", "")][it.get("folder") or "misc"].append(it)

        for cls_order, (cls, folders) in enumerate(by_class.items()):
            cls_id = f"{subject}/c{cls}"
            nodes.append(make(cls_id, subject, cls_order, NodeKind.CONTAINER, None, f"Class {cls}" if cls else "Unclassified", "class"))
            for folder_order, (folder, items) in enumerate(folders.items()):
                folder_id = f"{cls_id}/{folder}"
                nodes.append(make(folder_id, cls_id, folder_order, NodeKind.CONTAINER, None, folder, "folder"))
                vert_id = f"{folder_id}/v"
                nodes.append(make(vert_id, folder_id, 0, NodeKind.CONTAINER, None, folder, "vertical"))
                for item_order, it in enumerate(items):
                    ctype = HexisContentType(it["ctype"])
                    item_type = _CTYPE_ITEM[ctype]
                    raw = _mcq(it) if item_type == ItemType.QUIZ else _body(it)
                    nodes.append(make(
                        it["cid"], vert_id, item_order, NodeKind.ITEM, item_type,
                        it.get("title", ""), _CTYPE_NATIVE[ctype], raw=raw,
                        meta={
                            "folder": folder, "class": cls,
                            "language": to_iso_639_1(it.get("language", "")),
                            "common_content": it.get("common_content", ""),
                            "author_id": it.get("author_id", ""),
                        },
                    ))
        return nodes
