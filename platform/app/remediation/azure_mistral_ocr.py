from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import os
import re
from collections.abc import AsyncIterator
from uuid import uuid4

from mistralai.azure.client import MistralAzure
from mistralai.azure.client import models as azure_mistral_models
from omni_ingest.agent.document import OcrAgent
from omni_ingest.core.config import settings
from omni_ingest.core.model import ByteContent, KnowledgeItem, ResolvedResource, StepResult
from omni_ingest.core.ocr import Ocr, OcrBuilderParams, OcrFactory, OcrOutputFormat
from omni_ingest.core.pipeline import IngestionContext, register_step
from pydantic import Field, PositiveInt

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)

ENGINE_NAME = "azure_mistral"

_IMAGE_REF = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")


def _decode_data_uri(data_uri: str) -> tuple[bytes, str]:
    header, _, b64 = data_uri.partition(",")
    content_type = header.removeprefix("data:").split(";")[0] or "application/octet-stream"
    return base64.b64decode(b64), content_type


def azure_mistral_ocr_builder(
    params: OcrBuilderParams,
    new_items: list[KnowledgeItem],
    extract_images: bool,
    image_min_size: int | None,
    extract_header_footer: bool,
    deduplicate: bool,
) -> Ocr:
    if params.format not in {OcrOutputFormat.MARKDOWN}:
        raise ValueError(f"Mistral Document AI only returns Markdown, got '{params.format.value}'")
    if params.dst_lang is not None:
        raise ValueError("Mistral Document AI does not support a destination language option")

    key = get_settings().mistral_ocr_api_key
    endpoint = get_settings().mistral_ocr_endpoint
    if not key or not endpoint:
        raise ValueError("MISTRAL_OCR_API_KEY/MISTRAL_OCR_ENDPOINT are not configured")
    model = os.environ.get("MISTRAL_OCR_MODEL", settings.mistral_ocr_model)

    seen_hashes: dict[bytes, str] = {}

    def make_image_item(img, page_num: int, page_dims, parent: KnowledgeItem) -> str:
        raw, content_type = _decode_data_uri(img.image_base64 or "")
        if not raw:
            raise RuntimeError(
                f"Mistral Document AI returned image {img.id} on page {page_num} without image data. "
                "Retry the job. If it fails again, check that the OCR deployment supports include_image_base64."
            )
        new_id = uuid4()
        if deduplicate:
            digest = hashlib.sha256(raw).digest()
            existing = seen_hashes.get(digest)
            if existing is not None:
                return existing
            seen_hashes[digest] = str(new_id)
        new_items.append(KnowledgeItem(
            id=new_id,
            raw_content=raw,
            content_encoding="binary",
            tenant_id=parent.tenant_id,
            source_uri=parent.source_uri,
            metadata={
                "kind": "image",
                "parent_id": str(parent.id),
                "page": page_num,
                "bbox": [img.top_left_x, img.top_left_y, img.bottom_right_x, img.bottom_right_y],
                "page_dimensions": {"dpi": page_dims.dpi, "width": page_dims.width, "height": page_dims.height} if page_dims else None,
                "content_type": content_type,
                "source": "mistral_ocr",
            },
        ))
        return str(new_id)

    def replace_images(markdown: str, images, page_num: int, page_dims, parent: KnowledgeItem) -> str:
        img_by_id = {img.id: img for img in images}
        id_map: dict[str, str] = {}

        def repl(match: re.Match) -> str:
            ref = match.group(1)
            img = img_by_id.get(ref)
            if img is None:
                logger.warning("Page %s references image %r that Mistral OCR did not return", page_num, ref)
                return f"[Figure missing from OCR output: {ref}. Check page {page_num} of the source PDF.]"
            if ref not in id_map:
                id_map[ref] = make_image_item(img, page_num, page_dims, parent)
            return f'<image id="{id_map[ref]}"/>'

        return _IMAGE_REF.sub(repl, markdown)

    async def one(client: MistralAzure, item: ByteContent, sem: asyncio.Semaphore):
        async with sem:
            content_type = await item.content_type(params.ctx)
            uri = f"data:{content_type};base64,{base64.b64encode(await item.content(params.ctx)).decode()}"
            document = (
                azure_mistral_models.ImageURLChunk(image_url=uri)
                if content_type.startswith("image/")
                else azure_mistral_models.DocumentURLChunk(document_url=uri)
            )
            ocr_kwargs: dict[str, object] = {}
            if extract_images:
                ocr_kwargs["include_image_base64"] = True
                ocr_kwargs["image_min_size"] = image_min_size
            if extract_header_footer:
                ocr_kwargs["extract_header"] = True
                ocr_kwargs["extract_footer"] = True
            result = await client.ocr.process_async(model=model, document=document, **ocr_kwargs)
        if not result.pages:
            raise RuntimeError(f"Mistral Document AI returned no pages for {endpoint}, cannot silently produce empty OCR output")
        page_num = item.metadata["page"]
        texts, headers, footers = [], [], []
        for page in result.pages:
            if extract_images:
                texts.append(replace_images(page.markdown, page.images, page_num, page.dimensions, item))
            else:
                texts.append(page.markdown)
            if page.header:
                headers.append(page.header)
            if page.footer:
                footers.append(page.footer)
        if headers:
            item.metadata["ocr_header"] = "\n\n".join(headers)
        if footers:
            item.metadata["ocr_footer"] = "\n\n".join(footers)
        text = "\n\n".join(texts)
        changed = ByteContent.from_bytes(text.encode("utf-8"), params.format.mime_type)
        return item, changed

    async def ocr(items: AsyncIterator[ByteContent]):
        client = MistralAzure(api_key=key, server_url=endpoint)
        async with client:
            sem = asyncio.Semaphore(params.concurrency)
            for task in asyncio.as_completed([one(client, item, sem) async for item in items]):
                yield await task
    return ocr


class AzureMistralOcrAgent(OcrAgent):
    extract_images: bool = Field(default=False, description="Return each figure Mistral detects as an image item")
    image_min_size: PositiveInt | None = Field(default=None, description="Minimum figure size in pixels passed to Mistral")
    extract_header_footer: bool = Field(default=False, description="Separate page header/footer text from the body markdown")
    deduplicate: bool = Field(default=False, description="Reuse one image item for figures with identical bytes")

    async def run(self, ctx: IngestionContext[ResolvedResource]) -> StepResult:
        base_factory: OcrFactory = ctx.ocr_factory
        new_items: list[KnowledgeItem] = []

        def factory(engine: str, params: OcrBuilderParams) -> Ocr:
            if engine == ENGINE_NAME:
                return azure_mistral_ocr_builder(
                    params, new_items, self.extract_images, self.image_min_size, self.extract_header_footer, self.deduplicate
                )
            return base_factory(engine, params)

        ctx.ocr_factory = factory
        try:
            result = await super().run(ctx)
        finally:
            ctx.ocr_factory = base_factory
        if new_items:
            ctx.items = [*ctx.items, *new_items]
            result.items = ctx.items
        return result


register_step("azure_mistral_ocr", AzureMistralOcrAgent)
