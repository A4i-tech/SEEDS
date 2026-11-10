from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from omni_ingest.agent.enrichment import ExtractAgent
from omni_ingest.core.model import KnowledgeItem
from omni_ingest.core.pipeline import IngestionContext, register_step

logger = logging.getLogger(__name__)


class SafeExtractAgent(ExtractAgent):
    async def _extract(
        self,
        ingestion_ctx: IngestionContext,
        item_doc: Any,
        item_by_id: dict[str, KnowledgeItem],
        sem: asyncio.Semaphore,
        advance: Callable[[str], None],
    ) -> tuple[dict[str, Any], Any]:
        for attempt in range(3):
            try:
                return await super()._extract(ingestion_ctx, item_doc, item_by_id, sem, advance)
            except (TypeError, AttributeError, KeyError, NameError, NotImplementedError, RecursionError):
                raise
            except Exception as exc:
                err_str = str(exc).lower()
                is_rate_limit = "429" in err_str or "rate" in err_str
                if is_rate_limit and attempt < 2:
                    logger.warning("Rate limit on item %s, retrying in %ss...", item_doc.get("id"), (attempt + 1) * 3)
                    await asyncio.sleep((attempt + 1) * 3)
                    continue
                logger.warning("Extraction failed for item %s at %s: %s", item_doc.get("id"), self.path, exc)
                path_str = str(self.path)
                if "accessibility" in path_str:
                    fallback = {
                        "kind": "figure",
                        "alt_text": "Figure (needs review)",
                        "long_description": f"Figure description unavailable: {exc}",
                        "observed_result": "",
                        "visible_labels": [],
                        "confidence": 0.0,
                        "review_needed": True,
                        "review_reason": f"Alt-text error: {type(exc).__name__}: {exc}",
                    }
                elif "remediation" in path_str:
                    raw_text = ""
                    if isinstance(item_doc.get("metadata"), dict):
                        raw_text = (item_doc["metadata"].get("verified") or {}).get("markdown") or ""
                    if not raw_text:
                        raw_text = str(item_doc.get("text") or "")

                    blocks: list[dict[str, Any]] = []
                    for para in (raw_text or "Content requires review").split("\n\n"):
                        p = para.strip()
                        if p:
                            blocks.append({
                                "type": "paragraph",
                                "text": p,
                                "review_needed": True,
                                "review_reason": f"Remediation fallback: {type(exc).__name__}: {exc}",
                            })
                    if not blocks:
                        blocks = [{"type": "paragraph", "text": "Page content unparsed", "review_needed": True, "review_reason": str(exc)}]

                    fallback = {
                        "blocks": blocks,
                        "removed_artifacts": [],
                        "ocr_corrections": [],
                        "language": "auto",
                        "confidence": 0.0,
                        "review_needed": True,
                    }
                elif "verified" in path_str:
                    raw_text = str(item_doc.get("text") or "")
                    fallback = {
                        "markdown": raw_text or "Unverified page text",
                        "corrections": [],
                        "confidence": 0.0,
                        "review_needed": True,
                        "review_reason": f"Verification error: {type(exc).__name__}: {exc}",
                    }
                else:
                    fallback = {
                        "confidence": 0.0,
                        "review_needed": True,
                        "review_reason": f"Extraction error: {type(exc).__name__}: {exc}",
                    }
                return item_doc, fallback


register_step("safe_extract", SafeExtractAgent)

