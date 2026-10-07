from __future__ import annotations

from app.aggregators.models import CanonicalNode, ItemType
from app.providers.blob_storage import BlobStorageProvider
from app.serializers.subodha_serializer import LegacyBlock, LegacyCourseDoc, _resolve
from app.serializers.subodha_serializer import to_course_doc as build_course_doc


async def _to_legacy_block(node: CanonicalNode, blob: BlobStorageProvider) -> LegacyBlock:
    is_quiz = node.item_type == ItemType.QUIZ
    return LegacyBlock(
        block_id=node.source_id, type=node.native_type, display_name=node.display_name,
        html="", markdown=None if is_quiz else await _resolve(node, blob, "markdown_url") or None,
        student_view_data=None, lms_url="",
        question=node.content.question if is_quiz else None,
        choices=node.content.choices if is_quiz else None,
    )


async def to_course_doc(nodes: list[CanonicalNode], blob: BlobStorageProvider) -> LegacyCourseDoc:
    return await build_course_doc(nodes, blob, to_block=_to_legacy_block)
