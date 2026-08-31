from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

from app.aggregators.content_strategies import STRATEGY_REGISTRY
from app.aggregators.models import (
    BlobContext,
    CanonicalNode,
    ContentPayload,
    ItemType,
    NodeKind,
    QuizContent,
    content_dto_for_item_type,
)
from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreateRequest,
    PartnerContentUpdateRequest,
)
from app.platform.error_handling import AppError, NotFoundError
from app.providers.blob_storage import BlobStorageProvider
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.services.language_registry import SUPPORTED_LANGUAGES

_SOURCE_TYPE = "partner"
_UPLOAD_EXTENSIONS = (".mp3", ".brf")
_TYPE_TO_ITEM_TYPE: dict[str, ItemType] = {
    "story": ItemType.AUDIO,
    "brf": ItemType.BRAILLE,
    "notes": ItemType.PLAINTEXT,
    "quiz": ItemType.QUIZ,
}
_SUPPORTED_LANGUAGE_CODES = {lang["code"] for lang in SUPPORTED_LANGUAGES}


def _now() -> str:
    return datetime.now(UTC).isoformat()


class PartnerContentService:
    def __init__(self, repo: ContentAggregatorRepository, blob: BlobStorageProvider, asset_container: str) -> None:
        self._repo = repo
        self._blob = blob
        self._asset_container = asset_container

    async def create_upload_url(self, blob_name: str) -> str:
        if not blob_name.lower().endswith(_UPLOAD_EXTENSIONS):
            raise AppError("UNSUPPORTED_TYPE", "Only .mp3 or .brf files are allowed.", 400)
        return await self._blob.get_upload_sas_url("input-container", blob_name, expiry_hours=1)

    async def create_item(
        self, tenant_id: str, client_id: str, source_id: str, body: PartnerContentCreateRequest
    ) -> list[CanonicalNode]:
        item_type = _TYPE_TO_ITEM_TYPE.get(body.type)
        if item_type is None:
            raise AppError("UNSUPPORTED_TYPE", f"Unsupported content type '{body.type}'", 400)
        if body.language not in _SUPPORTED_LANGUAGE_CODES:
            raise AppError("UNSUPPORTED_LANGUAGE", f"Unsupported language '{body.language}'", 400)

        now = _now()
        if item_type == ItemType.QUIZ:
            nodes = self._build_quiz_nodes(tenant_id, client_id, source_id, body, now)
        else:
            ctx = BlobContext(container=self._asset_container, blob_prefix=f"partner/{client_id}/items/{source_id}")
            content = await self._build_single_content(item_type, body, ctx)
            nodes = [self._make_node(tenant_id, client_id, source_id, None, item_type, body.display_name, content, now)]

        for node in nodes:
            await self._repo.upsert_item(node)
        return nodes

    async def get_item(self, tenant_id: str, client_id: str, source_id: str) -> CanonicalNode:
        node = await self._repo.get_by_client(tenant_id, client_id, source_id)
        if node is None:
            raise NotFoundError("content item", source_id)
        return node

    async def list_items(self, tenant_id: str, client_id: str) -> list[CanonicalNode]:
        return await self._repo.list_by_client(tenant_id, client_id)

    async def get_status(self, tenant_id: str, client_id: str, source_id: str) -> str:
        await self.get_item(tenant_id, client_id, source_id)
        return "completed"

    async def update_item(
        self, tenant_id: str, client_id: str, source_id: str, body: PartnerContentUpdateRequest
    ) -> CanonicalNode:
        node = await self.get_item(tenant_id, client_id, source_id)
        if node.item_type is None:
            raise AppError("VALIDATION_ERROR", "cannot update a container node directly", 422)
        new_content = content_dto_for_item_type(node.item_type).from_dict(body.content)
        modified = await self._repo.update_item_content(tenant_id, _SOURCE_TYPE, client_id, source_id, new_content)
        if not modified:
            raise NotFoundError("content item", source_id)
        return await self.get_item(tenant_id, client_id, source_id)

    async def delete_item(self, tenant_id: str, client_id: str, source_id: str) -> None:
        modified = await self._repo.soft_delete(tenant_id, client_id, source_id, _now())
        if not modified:
            raise NotFoundError("content item", source_id)

    async def _build_single_content(
        self, item_type: ItemType, body: PartnerContentCreateRequest, ctx: BlobContext
    ) -> ContentPayload:
        if item_type == ItemType.AUDIO:
            if not body.audio_url.startswith("https://"):
                raise AppError("URL_NOT_HTTPS", "audio_url must be an https:// URL", 400)
            return await STRATEGY_REGISTRY[ItemType.AUDIO].process(body.audio_url, ctx, self._blob)
        if item_type == ItemType.BRAILLE:
            if not body.brf_url.startswith("https://"):
                raise AppError("URL_NOT_HTTPS", "brf_url must be an https:// URL", 400)
            content = await STRATEGY_REGISTRY[ItemType.BRAILLE].process(body.brf_url, ctx, self._blob)
            return replace(content, braille_grade=body.braille_grade)
        return await STRATEGY_REGISTRY[ItemType.PLAINTEXT].process(body.text, ctx, self._blob)

    def _build_quiz_nodes(
        self, tenant_id: str, client_id: str, source_id: str, body: PartnerContentCreateRequest, now: str
    ) -> list[CanonicalNode]:
        if not body.questions:
            raise AppError("VALIDATION_ERROR", "quiz content requires at least one question", 422)
        container = self._make_node(
            tenant_id, client_id, source_id, None, None, body.display_name, None, now, node_kind=NodeKind.CONTAINER
        )
        children = []
        for i, question in enumerate(body.questions):
            choices = [
                {"id": str(idx), "text": choice.text, "correct": choice.correct}
                for idx, choice in enumerate(question.choices)
            ]
            content = QuizContent(raw_html_url="", question=question.text, choices=choices)
            child_id = f"{source_id}:{i}"
            children.append(self._make_node(tenant_id, client_id, child_id, source_id, ItemType.QUIZ, question.text, content, now))
        return [container, *children]

    def _make_node(
        self,
        tenant_id: str,
        client_id: str,
        source_id: str,
        parent_id: str | None,
        item_type: ItemType | None,
        display_name: str,
        content: ContentPayload | None,
        now: str,
        *,
        node_kind: NodeKind = NodeKind.ITEM,
    ) -> CanonicalNode:
        return CanonicalNode(
            tenant_id=tenant_id, source_type=_SOURCE_TYPE, source_id=source_id, root_id=client_id, parent_id=parent_id,
            order=0, node_kind=node_kind, item_type=item_type, display_name=display_name, content=content,
            lms_url=None, native_type=item_type.value if item_type else "container", source_metadata={},
            last_run_id="partner-push", fetched_at=now, created_at=now, updated_at=now, client_id=client_id,
        )
