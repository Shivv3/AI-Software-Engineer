import networkx as nx


def _truncate(text: str, max_len: int = 60) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def build_graph(requirements: list[str], conflicts: list[dict]) -> dict:
    graph = nx.DiGraph()

    for idx, text in enumerate(requirements):
        graph.add_node(idx, label=_truncate(text))

    for conflict in conflicts:
        graph.add_edge(
            conflict["req_a_index"],
            conflict["req_b_index"],
            type=conflict["conflict_type"],
            confidence=conflict["confidence"],
        )

    nodes = [{"id": n, "label": graph.nodes[n]["label"]} for n in graph.nodes]
    edges = [
        {
            "source": u,
            "target": v,
            "type": data.get("type"),
            "confidence": data.get("confidence"),
        }
        for u, v, data in graph.edges(data=True)
    ]

    return {"nodes": nodes, "edges": edges}
