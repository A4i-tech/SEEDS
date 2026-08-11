"""Content processing strategies — one class per ItemType (Strategy pattern).

Each strategy turns an item node's raw source-native payload into its final
typed content DTO. Strategies know nothing about which source (Subodha,
future aggregators) the node came from — that's the adapter's job.
"""
from __future__ import annotations

import abc
import logging

import nh3

from app.aggregators.html_to_markdown import html_to_markdown
from app.aggregators.models import (
    BlobContext,
    ContentPayload,
    DiscussionContent,
    ImageContent,
    ItemType,
    OtherContent,
    QuizContent,
    RawItemPayload,
    TextContent,
    VideoContent,
)
from app.providers.blob_storage import BlobStorageProvider

logger = logging.getLogger(__name__)

_ALLOWED_TAGS = {
    "p", "br", "hr", "span", "div",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "blockquote", "pre", "code",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td",
    "a", "img", "figure", "figcaption",
}
_ALLOWED_ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title", "width", "height"},
    "*": {"class"},
}
_ALLOWED_URL_SCHEMES = {"http", "https", "mailto"}


def _sanitize_html(html: str) -> str:
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        url_schemes=_ALLOWED_URL_SCHEMES,
        link_rel="noopener noreferrer",
    )


class ContentStrategy(abc.ABC):
    @abc.abstractmethod
    async def process(self, raw: RawItemPayload, ctx: BlobContext, blob: BlobStorageProvider) -> ContentPayload: ...


class TextStrategy(ContentStrategy):
    async def process(self, raw: RawItemPayload, ctx: BlobContext, blob: BlobStorageProvider) -> ContentPayload:
        raw_html = raw or ""
        try:
            markdown = html_to_markdown(raw_html)
        except (RuntimeError, OSError) as exc:
            logger.warning("[content-strategies] pandoc conversion failed for %s: %s", ctx.blob_prefix, exc)
            safe_html = _sanitize_html(raw_html)
            raw_html_url = await blob.upload_file(ctx.container, f"{ctx.blob_prefix}.raw.html", safe_html.encode("utf-8"), "text/html")
            return TextContent(raw_html_url=raw_html_url, conversion_failed=True)

        markdown_url = await blob.upload_file(ctx.container, f"{ctx.blob_prefix}.md", markdown.encode("utf-8"), "text/markdown")
        return TextContent(markdown_url=markdown_url)


class VideoStrategy(ContentStrategy):
    async def process(self, raw: RawItemPayload, ctx: BlobContext, blob: BlobStorageProvider) -> ContentPayload:
        data = raw if isinstance(raw, dict) else {}
        return VideoContent(
            sources=list(data.get("sources", [])),
            streams=data.get("streams"),
            poster_url=data.get("poster"),
            transcript_languages=dict(data.get("transcriptLanguages", {})),
        )


class ImageStrategy(ContentStrategy):
    async def process(self, raw: RawItemPayload, ctx: BlobContext, blob: BlobStorageProvider) -> ContentPayload:
        data = raw if isinstance(raw, dict) else {}
        return ImageContent(image_url=data.get("image_url", ""), alt_text=data.get("alt_text", ""))


async def _upload_raw_html(raw: RawItemPayload, ctx: BlobContext, blob: BlobStorageProvider) -> str:
    safe_html = _sanitize_html(raw or "")
    return await blob.upload_file(ctx.container, f"{ctx.blob_prefix}.raw.html", safe_html.encode("utf-8"), "text/html")


class QuizStrategy(ContentStrategy):
    async def process(self, raw: RawItemPayload, ctx: BlobContext, blob: BlobStorageProvider) -> ContentPayload:
        return QuizContent(raw_html_url=await _upload_raw_html(raw, ctx, blob))


class DiscussionStrategy(ContentStrategy):
    async def process(self, raw: RawItemPayload, ctx: BlobContext, blob: BlobStorageProvider) -> ContentPayload:
        return DiscussionContent(raw_html_url=await _upload_raw_html(raw, ctx, blob))


class OtherStrategy(ContentStrategy):
    async def process(self, raw: RawItemPayload, ctx: BlobContext, blob: BlobStorageProvider) -> ContentPayload:
        return OtherContent(payload=raw if isinstance(raw, dict) else {})


STRATEGY_REGISTRY: dict[ItemType, ContentStrategy] = {
    ItemType.TEXT: TextStrategy(),
    ItemType.VIDEO: VideoStrategy(),
    ItemType.IMAGE: ImageStrategy(),
    ItemType.QUIZ: QuizStrategy(),
    ItemType.DISCUSSION: DiscussionStrategy(),
    ItemType.OTHER: OtherStrategy(),
}
