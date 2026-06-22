"""
Hold music / on-hold phrase detector using OpenAI embeddings.

Ported from ConferenceV2 app/services/audio/hold_detector.py.

SECURITY:
  - Transcript text passed to the OpenAI API is redacted in INFO logs.
  - OPENAI_API_KEY is never logged.
"""

from __future__ import annotations

import asyncio
import logging
from app.platform.settings import get_settings
import os

logger = logging.getLogger(__name__)


class HoldDetector:
    """Detect on-hold audio by comparing transcribed text against known hold phrases.

    Uses semantic similarity (OpenAI embeddings) with a rule-based fallback.
    """

    EMBEDDING_MAX_RETRIES = 3
    EMBEDDING_RETRY_DELAY_SEC = 0.3

    def __init__(self, threshold: float = 0.82) -> None:
        self.client = None
        self.threshold = float(os.getenv("AUDIO_HOLD_SIMILARITY_THRESHOLD", str(threshold)))
        self.min_chars = int(os.getenv("AUDIO_HOLD_MIN_TEXT_CHARS", "6"))
        self.api_timeout = float(os.getenv("AUDIO_API_TIMEOUT_SECONDS", "8.0"))
        self.hold_phrases = [
            "the number you have called has currently put your call on hold. please stay on the line.",
            "the number you have called has currently put your call on hold please stay on the line",
            "the number you have called has currently put you on hold. please stay on the line.",
            "the number you have called has currently put you on hold please stay on the line",
            "thank you for holding. please stay on the line.",
            "thank you for holding please stay on the line",
        ]
        self.hold_embeddings: list = []
        self.rule_based_phrases = [self._normalize_text(p) for p in self.hold_phrases]

    @classmethod
    async def create(cls, threshold: float = 0.82) -> "HoldDetector":
        instance = cls(threshold)
        instance._init_client()
        await instance._load_embeddings()
        return instance

    def _init_client(self) -> None:

        api_key = get_settings().openai_api_key
        if not api_key:
            logger.warning("HoldDetector: OPENAI_API_KEY not set — rule-based mode only")
            return
        from openai import AsyncOpenAI  # type: ignore[import-untyped]  # noqa: PLC0415

        self.client = AsyncOpenAI(api_key=api_key)

    @staticmethod
    def _normalize_text(text: str) -> str:
        return " ".join((text or "").strip().lower().split())

    def _rule_based_detect(self, text: str) -> dict | None:
        normalized = self._normalize_text(text)
        if not normalized:
            return None
        for phrase in self.rule_based_phrases:
            if phrase and phrase in normalized:
                return {"is_hold": True, "score": 1.0, "matched_phrase": phrase, "threshold": self.threshold, "detection_method": "rule_based_exact_phrase"}
        keyword_patterns = (
            ("on hold", "stay on the line"),
            ("thank you for holding", "stay on the line"),
            ("currently put your call on hold",),
        )
        for pattern in keyword_patterns:
            if all(part in normalized for part in pattern):
                return {"is_hold": True, "score": 0.95, "matched_phrase": " / ".join(pattern), "threshold": self.threshold, "detection_method": "rule_based_keywords"}
        return None

    async def _load_embeddings(self) -> None:
        if not self.hold_embeddings:
            logger.info("HoldDetector: pre-loading hold phrase embeddings...")
            self.hold_embeddings = await self._get_embeddings(self.hold_phrases)
            logger.info("HoldDetector: loaded %d embeddings", len(self.hold_embeddings))

    async def _get_embeddings(self, texts: list[str]) -> list:
        if not texts or not self.client:
            return []
        last_error = None
        for attempt in range(1, self.EMBEDDING_MAX_RETRIES + 1):
            try:
                response = await asyncio.wait_for(
                    self.client.embeddings.create(input=texts, model="text-embedding-3-small"),
                    timeout=self.api_timeout,
                )
                return [d.embedding for d in response.data]
            except Exception as exc:
                last_error = exc
                if attempt < self.EMBEDDING_MAX_RETRIES:
                    await asyncio.sleep(self.EMBEDDING_RETRY_DELAY_SEC)
        logger.error("HoldDetector: embedding API failed after retries — %s", last_error)
        return []

    async def detect(self, text: str) -> dict:
        if not text or len(text.strip()) < self.min_chars:
            return {"is_hold": False, "score": 0.0}
        rule_result = self._rule_based_detect(text)
        if rule_result:
            return rule_result
        if not self.hold_embeddings:
            await self._load_embeddings()
        text_embeddings = await self._get_embeddings([text])
        if not text_embeddings:
            return {"is_hold": False, "score": 0.0}
        from scipy.spatial.distance import cosine  # type: ignore[import-untyped]  # noqa: PLC0415

        text_emb = text_embeddings[0]
        max_sim = 0.0
        matched_phrase = ""
        for idx, hold_emb in enumerate(self.hold_embeddings):
            try:
                sim = 1 - cosine(text_emb, hold_emb)
                if sim > max_sim:
                    max_sim = sim
                    matched_phrase = self.hold_phrases[idx] if idx < len(self.hold_phrases) else ""
            except ValueError:
                continue
        return {
            "is_hold": bool(max_sim >= self.threshold),
            "score": float(max_sim),
            "matched_phrase": matched_phrase,
            "threshold": float(self.threshold),
            "detection_method": "semantic_similarity",
        }
