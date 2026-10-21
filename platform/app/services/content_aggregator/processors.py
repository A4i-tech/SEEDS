from __future__ import annotations

from abc import ABC, abstractmethod

from app.platform.error_handling import AppError
from app.services.content_aggregator.content import PartnerContentService


class UnsupportedContentTypeError(AppError):
    def __init__(self, content_type: str) -> None:
        super().__init__(
            "UNSUPPORTED_CONTENT_TYPE", f"Unsupported content type: {content_type}", 400
        )


class ContentProcessor(ABC):
    def __init__(self, content_service: PartnerContentService) -> None:
        self._content_service = content_service

    @abstractmethod
    async def process(self, tenant_id: str, content_id: str) -> str: ...


class AudioContentProcessor(ContentProcessor):
    async def process(self, tenant_id: str, content_id: str) -> str:
        return await self._content_service.enqueue_content_job(tenant_id, content_id)


class QuizContentProcessor(ContentProcessor):
    async def process(self, tenant_id: str, content_id: str) -> str:
        return await self._content_service.enqueue_content_job(tenant_id, content_id)


_PROCESSORS: dict[str, type[ContentProcessor]] = {
    "story": AudioContentProcessor,
    "audio": AudioContentProcessor,
    "quiz": QuizContentProcessor,
}


def get_processor(content_type: str, content_service: PartnerContentService) -> ContentProcessor:
    processor = _PROCESSORS.get(content_type)
    if processor is None:
        raise UnsupportedContentTypeError(content_type)
    return processor(content_service)
