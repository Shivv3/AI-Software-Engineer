from shared.model_cache import load_sbert
from .embedding_store import index_project, get_project_chunks, cosine_scores


def retrieve_context(project_id: str, question: str, top_k: int = 3, documents: list[dict] | None = None) -> dict:
    model = load_sbert()

    if documents is not None:
        index_project(project_id, documents, model)

    chunks = get_project_chunks(project_id)
    if not chunks:
        return {"matches": []}

    query_emb = model.encode([question], normalize_embeddings=True)[0]
    ranked = cosine_scores(query_emb, chunks)
    return {"matches": ranked[: top_k]}
