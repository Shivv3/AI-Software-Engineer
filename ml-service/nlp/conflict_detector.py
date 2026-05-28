import itertools
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from shared.model_cache import load_sbert
from .negation_analyzer import classify_conflict
from .contradiction_graph import build_graph


def detect_conflicts(requirements: list[str], similarity_threshold: float = 0.55) -> dict:
    model = load_sbert()
    embeddings = model.encode(requirements, normalize_embeddings=True)
    sim_matrix = cosine_similarity(embeddings)

    conflicts = []
    for i, j in itertools.combinations(range(len(requirements)), 2):
        similarity = float(sim_matrix[i][j])
        if similarity < similarity_threshold:
            continue
        conflict_type, rule_score, evidence = classify_conflict(requirements[i], requirements[j])
        if not conflict_type:
            continue
        confidence = round(0.4 * similarity + 0.6 * rule_score, 4)
        conflicts.append(
            {
                "req_a": requirements[i],
                "req_b": requirements[j],
                "req_a_index": i,
                "req_b_index": j,
                "conflict_type": conflict_type,
                "similarity_score": round(similarity, 4),
                "confidence": confidence,
                "rule_evidence": evidence,
            }
        )

    graph = build_graph(requirements, conflicts)

    total = len(conflicts)
    high = len([c for c in conflicts if c["confidence"] >= 0.7])
    medium = len([c for c in conflicts if 0.5 <= c["confidence"] < 0.7])

    most_conflicted = None
    if conflicts:
        counts = {}
        for c in conflicts:
            counts[c["req_a"]] = counts.get(c["req_a"], 0) + 1
            counts[c["req_b"]] = counts.get(c["req_b"], 0) + 1
        most_conflicted = max(counts, key=counts.get)

    return {
        "conflict_pairs": conflicts,
        "graph": graph,
        "summary": {
            "total_conflicts": total,
            "high_confidence": high,
            "medium_confidence": medium,
            "most_conflicted_req": most_conflicted,
        },
    }
