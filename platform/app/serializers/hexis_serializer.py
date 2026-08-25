"""Rebuilds a {course, blocks[], outline[]} document from canonical Hexis
nodes for the /content-aggregators/hexis/* API — same LegacyCourseDoc shape as
Subodha so the frontend viewer is unchanged. Differences: plain-text items
render via the markdown path, and quiz items expose structured question/choices.
"""
from __future__ import annotations

import asyncio

from app.aggregators.models import CanonicalNode, ItemType, NodeKind, QuizContent
from app.providers.blob_storage import BlobStorageProvider
from app.serializers.subodha_serializer import (
    LegacyBlock,
    LegacyCourseDoc,
    _build_outline,
    _resolve_html,
    _resolve_markdown,
)


async def _to_legacy_block(node: CanonicalNode, blob: BlobStorageProvider) -> LegacyBlock:
    markdown: str | None = None
    html = ""
    question: str | None = None
    choices: list[dict[str, object]] | None = None

    if node.item_type == ItemType.QUIZ and isinstance(node.content, QuizContent):
        question = node.content.question
        choices = node.content.choices
        if question is None:
            html = await _resolve_html(node, blob)
    elif node.item_type in (ItemType.PLAINTEXT, ItemType.MARKDOWN):
        markdown = await _resolve_markdown(node, blob)
        if markdown is None:
            html = await _resolve_html(node, blob)
    else:
        html = await _resolve_html(node, blob)

    return LegacyBlock(
        block_id=node.source_id, type=node.native_type, display_name=node.display_name,
        html=html, markdown=markdown, student_view_data=None, lms_url=node.lms_url or "",
        question=question, choices=choices,
    )


async def to_course_doc(nodes: list[CanonicalNode], blob: BlobStorageProvider) -> LegacyCourseDoc:
    root = next(n for n in nodes if n.parent_id is None)
    meta = root.source_metadata

    containers_by_parent: dict[str | None, list[CanonicalNode]] = {}
    items_by_parent: dict[str, list[CanonicalNode]] = {}
    for n in nodes:
        if n is root:
            continue
        if n.node_kind == NodeKind.CONTAINER:
            containers_by_parent.setdefault(n.parent_id, []).append(n)
        else:
            items_by_parent.setdefault(n.parent_id, []).append(n)

    outline, item_nodes = _build_outline(containers_by_parent, items_by_parent, root.source_id)
    blocks = list(await asyncio.gather(*(_to_legacy_block(n, blob) for n in item_nodes)))

    return LegacyCourseDoc(
        source_id=root.source_id, source_type=root.source_type, content_hash=meta.get("content_hash"),
        title=root.display_name, org=meta.get("author_name"), course_number=None,
        description=None, language=None, start=None, pacing=None, hidden=None,
        invitation_only=None, mobile_available=None, blocks=blocks, outline=outline,
        last_run_id=root.last_run_id, fetched_at=root.fetched_at,
    )
