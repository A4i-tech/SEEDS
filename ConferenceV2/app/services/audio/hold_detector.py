import logging
import os
import asyncio
from openai import AsyncOpenAI
from scipy.spatial.distance import cosine

from app.conf_logger import logger_instance as logger

class HoldDetector:
    EMBEDDING_MAX_RETRIES = 3
    EMBEDDING_RETRY_DELAY_SEC = 0.3

    def __init__(self, threshold: float = 0.82):
        self.client = None
        self.threshold = float(os.getenv("AUDIO_HOLD_SIMILARITY_THRESHOLD", str(threshold)))
        self.min_chars = int(os.getenv("AUDIO_HOLD_MIN_TEXT_CHARS", "6"))
        # Similarity threshold:
        # > 0.82 usually indicates a strong match for short phrases with 'text-embedding-3-small'
        self.hold_phrases = [
            "the number you have called has currently put your call on hold. please stay on the line.",
            "the number you have called has currently put your call on hold please stay on the line",
            "the number you have called has currently put you on hold. please stay on the line.",
            "the number you have called has currently put you on hold please stay on the line",
            "thank you for holding. please stay on the line.",
            "thank you for holding please stay on the line"
        ]
        self.hold_embeddings = [] 
        self.rule_based_phrases = [self._normalize_text(p) for p in self.hold_phrases]

    @classmethod
    async def create(cls, threshold: float = 0.82):
        """Async factory to create and initialize HoldDetector with embeddings."""
        instance = cls(threshold)
        instance._init_client()
        await instance._load_embeddings()
        return instance

    def _init_client(self):
        logger.info("Initializing HoldDetector (AsyncOpenAI API)...")
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.warning(
                "OPENAI_API_KEY not found. Hold detection will run in rule-based mode."
            )
            self.client = None
            return
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
                return {
                    "is_hold": True,
                    "score": 1.0,
                    "matched_phrase": phrase,
                    "threshold": float(self.threshold),
                    "detection_method": "rule_based_exact_phrase",
                }

        keyword_patterns = (
            ("on hold", "stay on the line"),
            ("thank you for holding", "stay on the line"),
            ("currently put your call on hold",),
        )
        for pattern in keyword_patterns:
            if all(part in normalized for part in pattern):
                return {
                    "is_hold": True,
                    "score": 0.95,
                    "matched_phrase": " / ".join(pattern),
                    "threshold": float(self.threshold),
                    "detection_method": "rule_based_keywords",
                }
        return None

    async def _load_embeddings(self):
        """Loads embeddings for hold phrases once."""
        if not self.hold_embeddings:
            logger.info("Pre-loading hold phrase embeddings...")
            self.hold_embeddings = await self._get_embeddings(self.hold_phrases)
            logger.info(f"Loaded {len(self.hold_embeddings)} hold phrase embeddings.")

    async def _get_embeddings(self, texts):
        if not texts or not self.client:
            return []
        last_error = None
        for attempt in range(1, self.EMBEDDING_MAX_RETRIES + 1):
            try:
                # Using 'text-embedding-3-small'
                response = await self.client.embeddings.create(input=texts, model="text-embedding-3-small")
                # Verify structure: response.data is a list of Embedding objects
                return [data.embedding for data in response.data]
            except Exception as e:
                last_error = e
                if attempt < self.EMBEDDING_MAX_RETRIES:
                    logger.warning(
                        "Embedding API attempt %s/%s failed; retrying in %.1fs",
                        attempt,
                        self.EMBEDDING_MAX_RETRIES,
                        self.EMBEDDING_RETRY_DELAY_SEC,
                    )
                    await asyncio.sleep(self.EMBEDDING_RETRY_DELAY_SEC)
                else:
                    logger.error(f"Embedding API Error after retries: {e}")
        if last_error:
            logger.debug("Embedding API terminal failure details: %s", last_error)
        return []

    async def detect(self, text: str) -> dict:
        """
        Detects if the text matches any hold phrases.
        Returns:
            dict: {"is_hold": bool, "score": float, "matched_phrase": str, "threshold": float, "detection_method": str}
        """
        if not text or len(text.strip()) < self.min_chars:
            return {"is_hold": False, "score": 0.0}

        rule_based = self._rule_based_detect(text)
        if rule_based:
            return rule_based

        if not self.hold_embeddings:
            logger.warning("Hold embeddings not loaded. Attempting to load now.")
            await self._load_embeddings()

        text_embedding_list = await self._get_embeddings([text])
        if not text_embedding_list:
            return {"is_hold": False, "score": 0.0}
            
        text_embedding = text_embedding_list[0]
        
        # Compute max similarity and retain the closest phrase for observability.
        max_sim = 0.0
        matched_phrase = ""
        for idx, hold_emb in enumerate(self.hold_embeddings):
            # Cosine similarity = 1 - cosine distance
            try:
                # Ensure 1D arrays
                sim = 1 - cosine(text_embedding, hold_emb)
                if sim > max_sim:
                    max_sim = sim
                    if idx < len(self.hold_phrases):
                        matched_phrase = self.hold_phrases[idx]
            except ValueError:
                continue

        # Debug log only if significant score to reduce noise
        if max_sim > 0.7:
            logger.debug(
                "Hold score: %.3f (threshold: %.3f) matched_phrase='%s' text='%s'",
                max_sim,
                self.threshold,
                matched_phrase,
                text,
            )
        
        return {
            "is_hold": bool(max_sim >= self.threshold),
            "score": float(max_sim),
            "matched_phrase": matched_phrase,
            "threshold": float(self.threshold),
            "detection_method": "semantic_similarity",
        }
