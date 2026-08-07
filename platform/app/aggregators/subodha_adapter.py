"""SubodhaAdapter — the one concrete SourceAdapter for Subodha (Open edX).
Turns a native Subodha fetch result into canonical nodes; item nodes carry
their raw payload as a plain (non-dataclass-field) `.raw` attribute until
SourceAdapter.process_nodes() runs them through a ContentStrategy.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

from bs4 import BeautifulSoup

from app.aggregators.base_adapter import SourceAdapter
from app.aggregators.models import CanonicalNode, ItemType, NodeKind

_CONTENT_TYPES = {"html", "video", "problem", "drag-and-drop-v2", "lti", "discussion"}
_ITEM_TYPE_MAP: dict[str, ItemType] = {
    "html": ItemType.TEXT, "video": ItemType.VIDEO, "problem": ItemType.QUIZ, "discussion": ItemType.DISCUSSION,
}


def _rewrite_urls(html: str, url_map: dict[str, str]) -> str:
    if not html or not url_map:
        return html
    for original, blob_url in url_map.items():
        html = html.replace(original, blob_url)
    return html


def _strip_volatile(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(attrs={"data-request-token": True}):
        del tag["data-request-token"]
    return str(soup)


def _item_type_for(native_type: str) -> ItemType:
    return _ITEM_TYPE_MAP.get(native_type, ItemType.OTHER)


def _now() -> str:
    return datetime.now(UTC).isoformat()


class SubodhaAdapter(SourceAdapter):
    source_type: ClassVar[str] = "subodha"

    def is_empty(self, native_content: dict | None) -> bool:
        if not native_content or not native_content.get("blocks"):
            return True
        return not any(b.get("type") in _CONTENT_TYPES for b in native_content["blocks"].values())

    def build_canonical_nodes(
        self, native_course: dict, native_content: dict | None, run_id: str, url_map: dict[str, str]
    ) -> list[CanonicalNode]:
        course_source_id = native_course["id"]
        now = _now()

        course_node = CanonicalNode(
            tenant_id="", source_type=self.source_type, source_id=course_source_id, root_id=course_source_id,
            parent_id=None, order=0, node_kind=NodeKind.CONTAINER, item_type=None,
            display_name=native_course["name"], content=None, lms_url=None, native_type="course",
            source_metadata={
                "org": native_course["org"], "course_number": native_course["number"],
                "description": native_course.get("short_description"), "language": native_course.get("language"),
                "start": native_course["start"], "pacing": native_course["pacing"], "hidden": native_course["hidden"],
                "invitation_only": native_course["invitation_only"], "mobile_available": native_course["mobile_available"],
            },
            last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
        )
        nodes = [course_node]

        if not native_content or not native_content.get("blocks"):
            return nodes

        blocks = native_content["blocks"]
        root = native_content.get("root")
        course_block = blocks.get(root, {})

        def children_of_type(block: dict, child_type: str) -> list[str]:
            return [c for c in block.get("children", []) if blocks.get(c, {}).get("type") == child_type]

        def make_container(block_id: str, parent_id: str, native_type: str, order: int) -> CanonicalNode:
            block = blocks.get(block_id, {})
            return CanonicalNode(
                tenant_id="", source_type=self.source_type, source_id=block_id, root_id=course_source_id,
                parent_id=parent_id, order=order, node_kind=NodeKind.CONTAINER, item_type=None,
                display_name=block.get("display_name") or "", content=None, lms_url=None,
                native_type=native_type, source_metadata={}, last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
            )

        def make_item(block_id: str, parent_id: str, order: int) -> CanonicalNode:
            block = blocks.get(block_id, {})
            native_type = block.get("type")
            item_type = _item_type_for(native_type)
            if item_type in (ItemType.TEXT, ItemType.QUIZ, ItemType.DISCUSSION, ItemType.OTHER):
                raw = _rewrite_urls(_strip_volatile(block.get("student_view_html") or ""), url_map)
            else:
                raw = block.get("student_view_data")
            node = CanonicalNode(
                tenant_id="", source_type=self.source_type, source_id=block_id, root_id=course_source_id,
                parent_id=parent_id, order=order, node_kind=NodeKind.ITEM, item_type=item_type,
                display_name=block.get("display_name") or "", content=None, lms_url=block.get("lms_web_url") or "",
                native_type=native_type, source_metadata={}, last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
            )
            node.raw = raw
            return node

        for chapter_order, chapter_id in enumerate(children_of_type(course_block, "chapter")):
            nodes.append(make_container(chapter_id, course_source_id, "chapter", chapter_order))
            chapter = blocks.get(chapter_id, {})
            for seq_order, seq_id in enumerate(children_of_type(chapter, "sequential")):
                nodes.append(make_container(seq_id, chapter_id, "sequential", seq_order))
                sequential = blocks.get(seq_id, {})
                for vert_order, vert_id in enumerate(children_of_type(sequential, "vertical")):
                    nodes.append(make_container(vert_id, seq_id, "vertical", vert_order))
                    vertical = blocks.get(vert_id, {})
                    leaf_ids = [c for c in vertical.get("children", []) if blocks.get(c, {}).get("type") in _CONTENT_TYPES]
                    for leaf_order, leaf_id in enumerate(leaf_ids):
                        nodes.append(make_item(leaf_id, vert_id, leaf_order))

        return nodes
