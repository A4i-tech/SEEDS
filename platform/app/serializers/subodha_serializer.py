"""Rebuilds a {course, blocks[], outline[]} document from canonical
content_aggregators nodes for the /subodha/* API — snake_case throughout.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass

from app.aggregators.models import CanonicalNode, ItemType, NodeKind
from app.providers.blob_storage import BlobStorageProvider


@dataclass(frozen=True)
class LegacyBlock:
    block_id: str
    type: str
    display_name: str
    html: str
    student_view_data: dict[str, object] | None
    lms_url: str

    def to_dict(self) -> dict[str, object]:
        return {
            "block_id": self.block_id, "type": self.type, "display_name": self.display_name,
            "html": self.html, "student_view_data": self.student_view_data, "lms_url": self.lms_url,
        }


@dataclass(frozen=True)
class LegacyOutlineVertical:
    block_id: str
    display_name: str
    block_ids: list[str]

    def to_dict(self) -> dict[str, object]:
        return {"block_id": self.block_id, "display_name": self.display_name, "block_ids": self.block_ids}


@dataclass(frozen=True)
class LegacyOutlineSequential:
    block_id: str
    display_name: str
    verticals: list[LegacyOutlineVertical]

    def to_dict(self) -> dict[str, object]:
        return {"block_id": self.block_id, "display_name": self.display_name, "verticals": [v.to_dict() for v in self.verticals]}


@dataclass(frozen=True)
class LegacyOutlineChapter:
    block_id: str
    display_name: str
    sequentials: list[LegacyOutlineSequential]

    def to_dict(self) -> dict[str, object]:
        return {"block_id": self.block_id, "display_name": self.display_name, "sequentials": [s.to_dict() for s in self.sequentials]}


@dataclass(frozen=True)
class LegacyCourseDoc:
    source_id: str
    source_type: str
    content_hash: str | None
    title: str
    org: str | None
    course_number: str | None
    description: str | None
    language: str | None
    start: str | None
    pacing: str | None
    hidden: bool | None
    invitation_only: bool | None
    mobile_available: bool | None
    blocks: list[LegacyBlock]
    outline: list[LegacyOutlineChapter]
    last_run_id: str
    fetched_at: str

    def to_dict(self) -> dict[str, object]:
        return {
            "source_id": self.source_id, "source_type": self.source_type, "content_hash": self.content_hash,
            "title": self.title, "org": self.org, "course_number": self.course_number,
            "description": self.description, "language": self.language, "start": self.start,
            "pacing": self.pacing, "hidden": self.hidden, "invitation_only": self.invitation_only,
            "mobile_available": self.mobile_available, "blocks": [b.to_dict() for b in self.blocks],
            "outline": [c.to_dict() for c in self.outline], "last_run_id": self.last_run_id, "fetched_at": self.fetched_at,
        }


async def _resolve_html(node: CanonicalNode, blob: BlobStorageProvider) -> str:
    content = node.content
    url = getattr(content, "html_url", None) or getattr(content, "raw_html_url", None)
    if not url:
        return ""
    data = await blob.download_from_url(url)
    return data.decode("utf-8")


async def _to_legacy_block(node: CanonicalNode, blob: BlobStorageProvider) -> LegacyBlock:
    student_view_data = None
    html = ""
    if node.item_type == ItemType.VIDEO:
        content = node.content
        student_view_data = {
            "sources": content.sources, "streams": content.streams,
            "poster": content.poster_url, "transcript_languages": content.transcript_languages,
        }
    else:
        html = await _resolve_html(node, blob)
    return LegacyBlock(
        block_id=node.source_id, type=node.native_type, display_name=node.display_name,
        html=html, student_view_data=student_view_data, lms_url=node.lms_url or "",
    )


def _build_outline(
    containers_by_parent: dict[str | None, list[CanonicalNode]],
    items_by_parent: dict[str, list[CanonicalNode]],
    root_id: str,
) -> list[LegacyOutlineChapter]:
    def vertical_outline(vert: CanonicalNode) -> LegacyOutlineVertical:
        leaves = sorted(items_by_parent.get(vert.source_id, []), key=lambda n: n.order)
        return LegacyOutlineVertical(vert.source_id, vert.display_name, [l.source_id for l in leaves])

    def sequential_outline(seq: CanonicalNode) -> LegacyOutlineSequential:
        verticals = sorted(containers_by_parent.get(seq.source_id, []), key=lambda n: n.order)
        return LegacyOutlineSequential(seq.source_id, seq.display_name, [vertical_outline(v) for v in verticals])

    def chapter_outline(chapter: CanonicalNode) -> LegacyOutlineChapter:
        sequentials = sorted(containers_by_parent.get(chapter.source_id, []), key=lambda n: n.order)
        return LegacyOutlineChapter(chapter.source_id, chapter.display_name, [sequential_outline(s) for s in sequentials])

    chapters = sorted(containers_by_parent.get(root_id, []), key=lambda n: n.order)
    return [chapter_outline(c) for c in chapters]


async def to_course_doc(nodes: list[CanonicalNode], blob: BlobStorageProvider) -> LegacyCourseDoc:
    root = next(n for n in nodes if n.parent_id is None)
    meta = root.source_metadata

    containers_by_parent: dict[str | None, list[CanonicalNode]] = {}
    items_by_parent: dict[str, list[CanonicalNode]] = {}
    item_nodes: list[CanonicalNode] = []
    for n in nodes:
        if n is root:
            continue
        if n.node_kind == NodeKind.CONTAINER:
            containers_by_parent.setdefault(n.parent_id, []).append(n)
        else:
            items_by_parent.setdefault(n.parent_id, []).append(n)
            item_nodes.append(n)

    blocks = list(await asyncio.gather(*(_to_legacy_block(n, blob) for n in item_nodes)))

    return LegacyCourseDoc(
        source_id=root.source_id, source_type=root.source_type, content_hash=meta.get("content_hash"),
        title=root.display_name, org=meta.get("org"), course_number=meta.get("course_number"),
        description=meta.get("description"), language=meta.get("language"), start=meta.get("start"),
        pacing=meta.get("pacing"), hidden=meta.get("hidden"), invitation_only=meta.get("invitation_only"),
        mobile_available=meta.get("mobile_available"), blocks=blocks,
        outline=_build_outline(containers_by_parent, items_by_parent, root.source_id),
        last_run_id=root.last_run_id, fetched_at=root.fetched_at,
    )
