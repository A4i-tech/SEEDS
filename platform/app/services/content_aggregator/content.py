from __future__ import annotations

import logging
from datetime import UTC, datetime

from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreate,
    PartnerContentUpdate,
)
from app.platform.error_handling import AppError, NotFoundError
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_repository import ContentRepository
from app.services.language_registry import SUPPORTED_LANGUAGES

logger = logging.getLogger(__name__)

_SUPPORTED_LANGUAGE_CODES = {lang["code"] for lang in SUPPORTED_LANGUAGES}


def _content_key(doc: dict) -> str:
    return doc.get("content_id") or str(doc.get("_id"))


def _parse_cursor(cursor: str | None) -> tuple[int | None, str | None]:
    """Split a `{creation_time}_{key}` cursor; a malformed cursor restarts paging."""
    if not cursor:
        return None, None
    raw_time, _, key = cursor.partition("_")
    try:
        return int(raw_time), key or None
    except ValueError:
        logger.warning("Malformed pagination cursor ignored: %r", cursor)
        return None, None


class PartnerContentService:
    """Partner content is stored in `contentAggregators` in the contentsV3 shape.

    Reads union both `contentAggregators` (external/partner content) and
    `contentsV3` (our own content); partner docs win on a shared key.
    """

    def __init__(self, partner_repo: ContentAggregatorRepository, content_repo: ContentRepository) -> None:
        self._partner_repo = partner_repo
        self._content_repo = content_repo

    async def create_item(
        self, tenant_id: str, client_id: str, content_id: str, body: PartnerContentCreate
    ) -> None:
        self._validate_language(body.language)
        now = datetime.now(UTC)
        doc = body.model_dump(exclude_none=True)
        doc.update(
            content_id=content_id,
            created_by=client_id,
            creation_time=int(now.timestamp()),
            is_deleted=False,
            is_processed=False,
            version="v3",
            created_at=now,
            updated_at=now,
        )
        await self._partner_repo.upsert_partner_content(tenant_id, doc)

    async def update_item(
        self,
        tenant_id: str,
        content_id: str,
        body: PartnerContentUpdate,
        *,
        is_audio_uploaded: bool,
    ) -> dict:
        updates = body.model_dump(exclude_unset=True, exclude_none=True)
        if "language" in updates:
            self._validate_language(updates["language"])
        if is_audio_uploaded:
            updates["is_processed"] = False

        doc = await self._partner_repo.update_partner_content(tenant_id, content_id, updates)
        if doc is None:
            raise NotFoundError("content item", content_id)
        return doc

    async def delete_item(self, tenant_id: str, content_id: str) -> tuple[bool, int, int]:
        doc = await self._partner_repo.find_partner_content(tenant_id, content_id)
        if doc is None:
            raise NotFoundError("content item", content_id)
        return await self._partner_repo.soft_delete_partner_content(
            tenant_id, content_id, datetime.now(UTC).isoformat()
        )

    async def get_item(self, tenant_id: str, content_id: str) -> dict:
        doc = await self._partner_repo.find_partner_content(tenant_id, content_id)
        if doc is not None:
            return doc
        doc = await self._content_repo.find_by_content_id(content_id, tenant_id)
        if doc is not None:
            return doc
        raise NotFoundError("content item", content_id)

    async def list_items(
        self,
        tenant_id: str,
        *,
        language: str | None = None,
        theme: str | None = None,
        exp_name: str | None = None,
        ids: list[str] | None = None,
        only_teacher_app: bool = False,
        cursor: str | None = None,
        limit: int = 15,
    ) -> tuple[list[dict], str | None, bool]:
        """Return (items, next_cursor, has_more) merged across both collections."""
        after_creation_time, after_key = _parse_cursor(cursor)
        fetch_limit = limit + 1
        filters = {
            "content_ids": ids,
            "language": language,
            "theme": theme,
            "exp_name": exp_name,
            "only_teacher_app": only_teacher_app,
            "after_creation_time": after_creation_time,
            "after_key": after_key,
            "limit": fetch_limit,
        }
        own = await self._content_repo.search_content(tenant_id, **filters)
        partner = await self._partner_repo.search_partner_content(tenant_id, **filters)

        merged: dict[str, dict] = {}
        for doc in own:
            merged[_content_key(doc)] = doc
        for doc in partner:
            merged[_content_key(doc)] = doc

        items = sorted(merged.values(), key=lambda d: (-(d.get("creation_time") or 0), _content_key(d)))
        has_more = len(items) > limit
        items = items[:limit]
        next_cursor = f"{items[-1]['creation_time']}_{_content_key(items[-1])}" if has_more else None
        return items, next_cursor, has_more

    @staticmethod
    def _validate_language(language: str) -> None:
        if language not in _SUPPORTED_LANGUAGE_CODES:
            raise AppError("UNSUPPORTED_LANGUAGE", f"Unsupported language '{language}'", 400)
