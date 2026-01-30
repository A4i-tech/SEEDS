# from sentence_transformers import SentenceTransformer, util # Removed
import logging
import os
from openai import OpenAI
import numpy as np
from scipy.spatial.distance import cosine

logger = logging.getLogger("ml-audio-service")

class HoldDetector:
    def __init__(self, threshold: float = 0.82):
        logger.info("Loading HoldDetector (OpenAI API)...")
        api_key = os.environ.get("OPENAI_API_KEY")
        self.client = OpenAI(api_key=api_key)
        self.threshold = threshold
        self.hold_phrases = [
            "please hold",
            "hold on a second",
            "just a moment",
            "wait a minute",
            "can you hold",
            "please wait",
            "hang on",
            "one moment please",
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
        self.hold_embeddings = self._get_embeddings(self.hold_phrases)
        logger.info("HoldDetector initialized.")

    def _get_embeddings(self, texts):
        if not texts:
            return []
        try:
            response = self.client.embeddings.create(input=texts, model="text-embedding-3-small")
            return [data.embedding for data in response.data]
        except Exception as e:
            logger.error(f"Embedding API Error: {e}")
            return []        

    def detect(self, text: str) -> bool:
        if not text or len(text.strip()) < 3:
            return {"is_hold": False, "score": 0.0}
            
        text_embedding_list = self._get_embeddings([text])
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
