import os
import hashlib
import re
import numpy as np
from sentence_transformers import SentenceTransformer

_model = None


class HashEmbeddingModel:
    """Small offline fallback with the same encode() shape as SentenceTransformer."""

    def __init__(self, dimensions: int = 384):
        self.dimensions = dimensions

    def encode(self, texts, normalize_embeddings: bool = True):
        if isinstance(texts, str):
            texts = [texts]

        vectors = []
        for text in texts:
            vec = np.zeros(self.dimensions, dtype=np.float32)
            tokens = re.findall(r"[a-zA-Z0-9_]+", text.lower())
            for token in tokens:
                digest = hashlib.sha256(token.encode("utf-8")).digest()
                index = int.from_bytes(digest[:4], "little") % self.dimensions
                sign = 1.0 if digest[4] % 2 == 0 else -1.0
                vec[index] += sign
            if normalize_embeddings:
                norm = np.linalg.norm(vec)
                if norm > 0:
                    vec = vec / norm
            vectors.append(vec)

        return np.vstack(vectors)


def load_sbert():
    global _model
    if _model is None:
        base_dir = os.path.dirname(os.path.dirname(__file__))
        cache_dir = os.path.join(base_dir, "model_cache")
        os.makedirs(cache_dir, exist_ok=True)
        try:
            _model = SentenceTransformer("all-MiniLM-L6-v2", cache_folder=cache_dir)
        except Exception:
            _model = HashEmbeddingModel()
    return _model
