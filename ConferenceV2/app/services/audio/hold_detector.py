import logging
import os
from openai import AsyncOpenAI
from scipy.spatial.distance import cosine

from app.conf_logger import logger_instance as logger

class HoldDetector:
    def __init__(self, threshold: float = 0.82):
        self.client = None
        self.threshold = threshold
        # Similarity threshold:
        # > 0.82 usually indicates a strong match for short phrases with 'text-embedding-3-small'
        self.hold_phrases = [
            "thank you for holding",
            "thank you for your patience",
            "please enjoy the music",
            "music",
            "beeping",
            "background music",
            "stay on the line",
            "the number you have called has currently put you on hold",
            "he number you have called has currently put you on hold"
        ]
        self.hold_embeddings = [] 

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
            logger.warning("OPENAI_API_KEY not found. Hold detection will fail.")
        self.client = AsyncOpenAI(api_key=api_key)

    async def _load_embeddings(self):
        """Loads embeddings for hold phrases once."""
        if not self.hold_embeddings:
            logger.info("Pre-loading hold phrase embeddings...")
            self.hold_embeddings = await self._get_embeddings(self.hold_phrases)
            logger.info(f"Loaded {len(self.hold_embeddings)} hold phrase embeddings.")

    async def _get_embeddings(self, texts):
        if not texts or not self.client:
            return []
        try:
            # Using 'text-embedding-3-small'
            response = await self.client.embeddings.create(input=texts, model="text-embedding-3-small")
            # Verify structure: response.data is a list of Embedding objects
            return [data.embedding for data in response.data]
        except Exception as e:
            logger.error(f"Embedding API Error: {e}")
            return []

    async def detect(self, text: str) -> dict:
        """
        Detects if the text matches any hold phrases.
        Returns:
            dict: {"is_hold": bool, "score": float}
        """
        if not self.hold_embeddings:
            logger.warning("Hold embeddings not loaded. Attempting to load now.")
            await self._load_embeddings()
        
        if not text or len(text.strip()) < 3:
            return {"is_hold": False, "score": 0.0}
            
        text_embedding_list = await self._get_embeddings([text])
        if not text_embedding_list:
            return {"is_hold": False, "score": 0.0}
            
        text_embedding = text_embedding_list[0]
        
        # Compute max similarity
        max_sim = 0.0
        for hold_emb in self.hold_embeddings:
            # Cosine similarity = 1 - cosine distance
            try:
                # Ensure 1D arrays
                sim = 1 - cosine(text_embedding, hold_emb)
                if sim > max_sim:
                    max_sim = sim
            except ValueError:
                continue

        # Debug log only if significant score to reduce noise
        if max_sim > 0.7:
            logger.debug(f"Hold score: {max_sim:.2f} for text: '{text}'")
        
        return {"is_hold": bool(max_sim >= self.threshold), "score": float(max_sim)}
