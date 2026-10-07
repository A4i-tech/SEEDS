from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

from app.aggregators.content_strategies import STRATEGY_REGISTRY
from app.aggregators.models import (
    AudioContent,
    BlobContext,
    BrailleContent,
    CanonicalNode,
    ContentPayload,
    ItemType,
    NodeKind,
    QuizChoice,
    QuizContent,
    SourceType,
    TextContent,
)
from app.models.requests.content_aggregator_content_requests import (
    AudioContentPatch,
    BrailleContentPatch,
    PartnerBrfCreate,
    PartnerContentCreateRequest,
    PartnerContentUpdateRequest,
    PartnerNotesCreate,
    PartnerQuizCreate,
    PartnerStoryCreate,
    QuizContentPatch,
    TextContentPatch,
)
from app.platform.error_handling import AppError
from app.providers.blob_storage import BlobStorageProvider
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.services.language_registry import SUPPORTED_LANGUAGES

_UPLOAD_EXTENSIONS = (".mp3", ".brf")
_PATCH_BY_ITEM_TYPE: dict[ItemType, type] = {
    ItemType.AUDIO: AudioContentPatch,
    ItemType.BRAILLE: BrailleContentPatch,
    ItemType.PLAINTEXT: TextContentPatch,
    ItemType.QUIZ: QuizContentPatch,
}
_SUPPORTED_LANGUAGE_CODES = {lang["code"] for lang in SUPPORTED_LANGUAGES}


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _content_from_patch(patch: AudioContentPatch | BrailleContentPatch | TextContentPatch | QuizContentPatch) -> ContentPayload:
    match patch:
        case AudioContentPatch():
            return AudioContent(audio_url=patch.audio_url)
        case BrailleContentPatch():
            return BrailleContent(brf_url=patch.brf_url, braille_grade=patch.braille_grade)
        case TextContentPatch():
            return TextContent(markdown_url=patch.markdown_url)
        case QuizContentPatch():
            choices = [QuizChoice(**choice.model_dump(exclude_defaults=True)) for choice in patch.choices]
            return QuizContent(raw_html_url=patch.raw_html_url, question=patch.question, choices=choices)


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
        if body.language not in _SUPPORTED_LANGUAGE_CODES:
            raise AppError("UNSUPPORTED_LANGUAGE", f"Unsupported language '{body.language}'", 400)

        now = _now()
        if isinstance(body, PartnerQuizCreate):
            nodes = self._build_quiz_nodes(client_id, source_id, body, now)
        else:
            ctx = BlobContext(container=self._asset_container, blob_prefix=f"partner/{client_id}/items/{source_id}")
            item_type, content = await self._build_single_content(body, ctx)
            nodes = [self._make_node(client_id, source_id, None, item_type, body.display_name, content, now)]

        for node in nodes:
            await self._repo.upsert_item(tenant_id, node)
        return nodes

    async def get_item(self, tenant_id: str, client_id: str, source_id: str) -> CanonicalNode:
        return await self._repo.get_by_client(tenant_id, client_id, source_id)

    async def list_items(self, tenant_id: str, client_id: str) -> list[CanonicalNode]:
        return await self._repo.list_by_client(tenant_id, client_id)

    async def update_item(
        self, tenant_id: str, client_id: str, source_id: str, body: PartnerContentUpdateRequest
    ) -> CanonicalNode:
        node = await self.get_item(tenant_id, client_id, source_id)
        if node.node_kind == NodeKind.CONTAINER:
            raise AppError("VALIDATION_ERROR", "cannot update a container node directly", 422)
        if not isinstance(body.content, _PATCH_BY_ITEM_TYPE[node.item_type]):
            raise AppError("VALIDATION_ERROR", f"content does not match item type '{node.item_type}'", 422)
        await self._repo.update_item_content(tenant_id, client_id, source_id, _content_from_patch(body.content))
        return replace(node, content=_content_from_patch(body.content))

    async def delete_item(self, tenant_id: str, client_id: str, source_id: str) -> None:
        await self.get_item(tenant_id, client_id, source_id)
        await self._repo.soft_delete(tenant_id, client_id, source_id, _now())

    async def _build_single_content(
        self, body: PartnerStoryCreate | PartnerBrfCreate | PartnerNotesCreate, ctx: BlobContext
    ) -> tuple[ItemType, ContentPayload]:
        match body:
            case PartnerStoryCreate():
                return ItemType.AUDIO, await STRATEGY_REGISTRY[ItemType.AUDIO].process(body.audio_url, ctx, self._blob)
            case PartnerBrfCreate():
                content = await STRATEGY_REGISTRY[ItemType.BRAILLE].process(body.brf_url, ctx, self._blob)
                return ItemType.BRAILLE, replace(content, braille_grade=body.braille_grade)
            case PartnerNotesCreate():
                return ItemType.PLAINTEXT, await STRATEGY_REGISTRY[ItemType.PLAINTEXT].process(body.text, ctx, self._blob)

    def _build_quiz_nodes(
        self, client_id: str, source_id: str, body: PartnerQuizCreate, now: str
    ) -> list[CanonicalNode]:
        container = self._make_node(
            client_id, source_id, None, None, body.display_name, None, now, node_kind=NodeKind.CONTAINER
        )
        children = []
        for i, question in enumerate(body.questions):
            choices = [
                QuizChoice(value=str(idx), text=choice.text, correct=choice.correct)
                for idx, choice in enumerate(question.choices)
            ]
            content = QuizContent(raw_html_url="", question=question.text, choices=choices)
            children.append(
                self._make_node(client_id, f"{source_id}:{i}", source_id, ItemType.QUIZ, question.text, content, now)
            )
        return [container, *children]

    def _make_node(
        self,
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
            source_type=SourceType.PARTNER, source_id=source_id, root_id=client_id, parent_id=parent_id,
            order=0, node_kind=node_kind, item_type=item_type, display_name=display_name, content=content,
            lms_url="", native_type=item_type.value if item_type else "container", source_metadata={},
            last_run_id="partner-push", fetched_at=now, created_at=now, updated_at=now,
        )
