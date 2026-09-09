"""Safe extraction step that gracefully handles individual figure failures without crashing."""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

from omni_ingest.agent.enrichment import ExtractAgent
from omni_ingest.core.model import KnowledgeItem
from omni_ingest.core.pipeline import IngestionContext, register_step

logger = logging.getLogger(__name__)


class SafeExtractAgent(ExtractAgent):
    """Subclass of ExtractAgent that isolates failures per-item.

    If any individual figure fails extraction (e.g. LLM content filter, rate limit,
    or validation retry exhaustion), it catches the exception and returns a fallback
    spec with review_needed: True so the entire textbook pipeline does not crash.
    """

    async def _extract(
        self,
        ingestion_ctx: IngestionContext,
        item_doc: Any,
        item_by_id: dict[str, KnowledgeItem],
        sem: asyncio.Semaphore,
        advance: Callable[[str], None],
    ) -> tuple[dict[str, Any], Any]:
        # Save image crop bytes to workspace and out/ so downstream steps and blob storage have them
        if item_doc and "id" in item_doc:
            item_id = item_doc["id"]
            if item_id in item_by_id:
                img_item = item_by_id[item_id]
                try:
                    img_bytes = await img_item.content(ingestion_ctx)
                    if img_bytes:
                        filename = img_item.metadata.get("filename") or str(item_id)
                        if not filename.endswith((".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif")):
                            filename = f"{filename}.jpg"
                        out_dir = Path("out")
                        out_dir.mkdir(parents=True, exist_ok=True)
                        (out_dir / filename).write_bytes(img_bytes)
                        Path(filename).write_bytes(img_bytes)
                except Exception as e:
                    logger.warning("safe_extract: could not save image %s to disk: %s", item_id, e)

        for attempt in range(3):
            try:
                return await super()._extract(ingestion_ctx, item_doc, item_by_id, sem, advance)
            except Exception as exc:
                err_str = str(exc).lower()
                is_rate_limit = "429" in err_str or "rate" in err_str
                if is_rate_limit and attempt < 2:
                    logger.warning("Rate limit on item %s, retrying in %ss...", item_doc.get("id"), (attempt + 1) * 3)
                    await asyncio.sleep((attempt + 1) * 3)
                    continue
                logger.warning("Extraction failed for item %s: %s", item_doc.get("id"), exc)
                fallback = {
                    "kind": "figure",
                    "alt_text": "Figure (needs review)",
                    "long_description": f"Figure description unavailable: {exc}",
                    "observed_result": "",
                    "visible_labels": [],
                    "confidence": 0.0,
                    "review_needed": True,
                    "review_reason": f"Alt-text extraction error: {type(exc).__name__}: {exc}",
                }
                advance("extracted (fallback)")
                return item_doc, fallback
        return item_doc, {}


register_step("safe_extract", SafeExtractAgent)
