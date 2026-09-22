"""Azure AI Foundry OCR via Mistral Document AI.

OmniIngest dropped this engine from its own factory (feat/mistral-ocr PR review,
2026-09-16) since OmniIngest itself has no Azure-specific caller. Seeds does —
our Foundry deployment is the only real OCR target here — so it lives here
instead, wired in as an extra engine on top of OmniIngest's built-in OcrAgent.

Vendored from OmniIngest commit 28c5143 (src/omni_ingest/port/ocr.py, before
the Azure removal), adapted to read its own env vars since OmniIngest's
Settings no longer carries MISTRAL_OCR_ENDPOINT.
"""
from __future__ import annotations

import asyncio
import base64
import os
from collections.abc import AsyncIterator

from mistralai.azure.client import MistralAzure
from mistralai.azure.client import models as azure_mistral_models
from omni_ingest.agent.document import OcrAgent
from omni_ingest.core.config import settings
from omni_ingest.core.model import ByteContent
from omni_ingest.core.ocr import Ocr, OcrBuilderParams, OcrFactory, OcrOutputFormat
from omni_ingest.core.pipeline import IngestionContext, register_step

from app.platform.settings import get_settings

ENGINE_NAME = "azure_mistral"


def azure_mistral_ocr_builder(params: OcrBuilderParams) -> Ocr:
    if params.format not in {OcrOutputFormat.MARKDOWN}:
        raise ValueError(f"Mistral Document AI only returns Markdown, got '{params.format.value}'")
    if params.dst_lang is not None:
        raise ValueError("Mistral Document AI does not support a destination language option")

    key = get_settings().mistral_ocr_api_key
    endpoint = get_settings().mistral_ocr_endpoint
    if not key or not endpoint:
        raise ValueError("MISTRAL_OCR_API_KEY/MISTRAL_OCR_ENDPOINT are not configured")
    model = os.environ.get("MISTRAL_OCR_MODEL", settings.mistral_ocr_model)

    async def one(client: MistralAzure, item: ByteContent, sem: asyncio.Semaphore):
        async with sem:
            content_type = await item.content_type(params.ctx)
            uri = f"data:{content_type};base64,{base64.b64encode(await item.content(params.ctx)).decode()}"
            document = (
                azure_mistral_models.ImageURLChunk(image_url=uri)
                if content_type.startswith("image/")
                else azure_mistral_models.DocumentURLChunk(document_url=uri)
            )
            result = await client.ocr.process_async(model=model, document=document)
        if not result.pages:
            raise RuntimeError(f"Mistral Document AI returned no pages for {endpoint}, cannot silently produce empty OCR output")
        text = "\n\n".join(page.markdown for page in result.pages)
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
    """OcrAgent with one extra engine, 'azure_mistral', layered on top of ctx.ocr_factory.

    OmniIngest's CLI has no factory-injection hook (a plugin hook for this was
    raised on the same PR and rejected as out of scope), so this wraps the
    context's factory for the duration of one step's run instead of touching
    OmniIngest.
    """

    async def run(self, ctx: IngestionContext) -> object:
        base_factory: OcrFactory = ctx.ocr_factory

        def factory(engine: str, params: OcrBuilderParams) -> Ocr:
            if engine == ENGINE_NAME:
                return azure_mistral_ocr_builder(params)
            return base_factory(engine, params)

        ctx.ocr_factory = factory
        try:
            return await super().run(ctx)
        finally:
            ctx.ocr_factory = base_factory


register_step("azure_mistral_ocr", AzureMistralOcrAgent)
