import numpy as np
from shared.model_cache import load_sbert


def _function_text(func: dict) -> str:
    parts = [func.get("name", "")]
    if func.get("signature"):
        parts.append(func["signature"])
    if func.get("docstring"):
        parts.append(func["docstring"])
    return " ".join([p for p in parts if p]).strip()


def analyze_traceability(requirements: list[str], code_functions: list[dict]) -> dict:
    model = load_sbert()
    req_texts = requirements
    func_texts = [_function_text(func) for func in code_functions]

    if not req_texts or not func_texts:
        return {
            "matrix": [],
            "links": [],
            "orphaned_reqs": list(range(len(req_texts))),
            "orphaned_code": [func.get("name") for func in code_functions],
            "coverage_pct": 0.0,
        }

    req_emb = model.encode(req_texts, normalize_embeddings=True)
    func_emb = model.encode(func_texts, normalize_embeddings=True)

    matrix = np.matmul(req_emb, np.transpose(func_emb))
    matrix_list = matrix.round(4).tolist()

    links = []
    strong = 0
    for i in range(len(req_texts)):
        for j in range(len(func_texts)):
            score = float(matrix[i][j])
            if score >= 0.65:
                strength = "strong"
                strong += 1
            elif score >= 0.45:
                strength = "weak"
            else:
                continue
            links.append(
                {
                    "req_idx": i,
                    "func_name": code_functions[j].get("name"),
                    "score": round(score, 4),
                    "strength": strength,
                }
            )

    orphaned_reqs = [
        idx for idx in range(len(req_texts)) if not any(link["req_idx"] == idx for link in links)
    ]
    orphaned_code = [
        func.get("name")
        for idx, func in enumerate(code_functions)
        if not any(link["func_name"] == func.get("name") for link in links)
    ]

    coverage_pct = 0.0
    if req_texts:
        covered = len(req_texts) - len(orphaned_reqs)
        coverage_pct = round((covered / len(req_texts)) * 100, 1)

    return {
        "matrix": matrix_list,
        "links": links,
        "orphaned_reqs": orphaned_reqs,
        "orphaned_code": orphaned_code,
        "coverage_pct": coverage_pct,
    }
