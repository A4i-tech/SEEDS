from __future__ import annotations

import json
from collections import defaultdict
from typing import ClassVar

from app.aggregators.base_adapter import SourceAdapter, _now
from app.aggregators.hexis_types import HexisContentItem, HexisContentType, HexisMcq, HexisSubject
from app.aggregators.models import CanonicalNode, ItemType, SourceType

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


def _mcq(item: HexisContentItem) -> HexisMcq:
    return json.loads(item["actual_content"])


class HexisAdapter(SourceAdapter):
    source_type: ClassVar[SourceType] = SourceType.HEXIS

    def is_empty(self, items: list[HexisContentItem]) -> bool:
        return not any(i["actual_content"].strip() for i in items)

    def build_canonical_nodes(
        self, native_subject: HexisSubject, native_items: list[HexisContentItem], run_id: str
    ) -> list[CanonicalNode]:
        subject = native_subject.subject_id
        now = _now()

        common = {"root_id": subject, "run_id": run_id, "now": now}
        nodes = [
            self.make_container(
                subject, 0, native_subject.name, "subject",
                meta={"subject": subject, "subject_name": native_subject.name}, **common,
            )
        ]

        by_class: dict[str, dict[str, list[HexisContentItem]]] = defaultdict(lambda: defaultdict(list))
        for it in native_items:
            by_class[it["class"]][it["folder"]].append(it)

        for cls_order, (cls, folders) in enumerate(by_class.items()):
            cls_id = f"{subject}/c{cls}"
            nodes.append(self.make_container(cls_id, cls_order, f"Class {cls}", "class", parent=subject, **common))
            for folder_order, (folder, items) in enumerate(folders.items()):
                folder_id = f"{cls_id}/{folder}"
                nodes.append(self.make_container(folder_id, folder_order, folder, "folder", parent=cls_id, **common))
                vert_id = f"{folder_id}/v"
                nodes.append(self.make_container(vert_id, 0, folder, "vertical", parent=folder_id, **common))
                for item_order, it in enumerate(items):
                    ctype = HexisContentType(it["ctype"])
                    item_type = _CTYPE_ITEM[ctype]
                    raw = _mcq(it) if item_type == ItemType.QUIZ else it["actual_content"]
                    nodes.append(self.make_item(
                        it["cid"], vert_id, item_order, item_type,
                        it["title"], _CTYPE_NATIVE[ctype], raw,
                        {
                            "folder": folder, "class": cls,
                            "language": it["language"],
                            "common_content": it["common_content"],
                            "author_id": it["author_id"],
                        },
                        **common,
                    ))
        return nodes
