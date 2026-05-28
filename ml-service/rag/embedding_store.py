import math
from dataclasses import dataclass
from typing import List
import numpy as np


@dataclass
class RagChunk:
    doc_id: str
    name: str
    text: str
    embedding: np.ndarray


_STORE = {}


def _chunk_text(text: str, max_chars: int = 1200) -> List[str]:
    chunks = []
    buffer = []
    length = 0
    for paragraph in text.split("\n\n"):
        part = paragraph.strip()
        if not part:
            continue
        if length + len(part) + 2 > max_chars and buffer:
            chunks.append("\n\n".join(buffer))
            buffer = []
            length = 0
        buffer.append(part)
        length += len(part) + 2
    if buffer:
        chunks.append("\n\n".join(buffer))
    return chunks or [text]


def index_project(project_id: str, documents: list[dict], model) -> int:
    chunks: List[RagChunk] = []
    for doc in documents:
        content = doc.get("content") or ""
        for chunk in _chunk_text(content):
            chunks.append(RagChunk(doc_id=doc.get("id"), name=doc.get("name") or "Document", text=chunk, embedding=None))

    if not chunks:
        _STORE[project_id] = []
        return 0

    embeddings = model.encode([c.text for c in chunks], normalize_embeddings=True)
    for idx, chunk in enumerate(chunks):
        chunk.embedding = embeddings[idx]

    _STORE[project_id] = chunks
    return len(chunks)


def get_project_chunks(project_id: str) -> List[RagChunk]:
    return _STORE.get(project_id, [])


def cosine_scores(query_emb: np.ndarray, chunks: List[RagChunk]) -> list[dict]:
    scores = []
    for chunk in chunks:
        score = float(np.dot(query_emb, chunk.embedding)) if chunk.embedding is not None else 0.0
        scores.append(
            {
                "doc_id": chunk.doc_id,
                "name": chunk.name,
                "text": chunk.text,
                "score": round(score, 4),
            }
        )
    return sorted(scores, key=lambda item: item["score"], reverse=True)
