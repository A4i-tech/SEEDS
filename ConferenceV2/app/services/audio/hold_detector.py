import logging
import os
from openai import AsyncOpenAI
from scipy.spatial.distance import cosine

logger = logging.getLogger("ml-audio-service")

class HoldDetector:
    def __init__(self, threshold: float = 0.82):
        logger.info("Loading HoldDetector (AsyncOpenAI API)...")
        api_key = os.environ.get("OPENAI_API_KEY")
        self.client = AsyncOpenAI(api_key=api_key)
        self.threshold = threshold
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
        self.hold_embeddings = [] # Initialize empty, load async
        logger.info("HoldDetector initialized (embeddings will load lazily or need async init).")

    async def _get_embeddings(self, texts):
        if not texts:
            return []
        try:
            response = await self.client.embeddings.create(input=texts, model="text-embedding-3-small")
            return [data.embedding for data in response.data]
        except Exception as e:
            logger.error(f"Embedding API Error: {e}")
            return []        

    async def ensure_embeddings_loaded(self):
        if not self.hold_embeddings:
             self.hold_embeddings = await self._get_embeddings(self.hold_phrases)

    async def detect(self, text: str) -> bool:
        await self.ensure_embeddings_loaded()
        
        if not text or len(text.strip()) < 3:
            return {"is_hold": False, "score": 0.0}
            
        text_embedding_list = await self._get_embeddings([text])
        if not text_embedding_list:
            return {"is_hold": False, "score": 0.0}
            
        text_embedding = text_embedding_list[0]
        
        # Compute max similarity
        max_sim = 0
        for hold_emb in self.hold_embeddings:
            # Cosine similarity = 1 - cosine distance
            sim = 1 - cosine(text_embedding, hold_emb)
            if sim > max_sim:
                max_sim = sim
                
        logger.debug(f"Hold score: {max_sim:.2f} for text: '{text}'")
        
        return {"is_hold": bool(max_sim >= self.threshold), "score": float(max_sim)}
