import re
from shared.spacy_loader import load_nlp

VAGUE_ADJECTIVES = {
    "fast",
    "quick",
    "slow",
    "easy",
    "simple",
    "secure",
    "reliable",
    "efficient",
    "good",
    "bad",
    "nice",
    "friendly",
    "intuitive",
    "seamless",
    "smooth",
    "better",
    "high",
    "low",
    "minimal",
    "adequate",
    "sufficient",
    "proper",
    "effective",
    "responsive",
    "scalable",
    "maintainable",
    "robust",
}

QUALITY_TRIGGERS = {
    "performance",
    "speed",
    "latency",
    "response time",
    "load time",
    "throughput",
    "availability",
    "uptime",
    "reliability",
    "security",
    "capacity",
    "concurrent",
    "memory",
    "cpu",
}

AMBIGUOUS_PRONOUNS = {"it", "they", "them", "this", "that", "these", "those"}

PENALTY_WEIGHTS = {
    "vague_term": 15,
    "ambiguous_pronoun": 12,
    "missing_actor": 20,
    "missing_action": 25,
    "passive_without_actor": 8,
    "missing_measurable": 18,
}


def _detect_issues(text: str) -> list[dict]:
    nlp = load_nlp()
    doc = nlp(text)
    issues = []
    text_lower = text.lower()
    seen_vague_terms = set()
    has_parser = doc.has_annotation("DEP")

    for token in doc:
        if token.pos_ == "ADJ" and token.lemma_.lower() in VAGUE_ADJECTIVES:
            seen_vague_terms.add(token.lemma_.lower())
            issues.append(
                {
                    "type": "vague_term",
                    "description": f'"{token.text}" is unmeasurable. Add a numeric metric.',
                }
            )

    for vague in sorted(VAGUE_ADJECTIVES):
        if vague not in seen_vague_terms and re.search(rf"\b{re.escape(vague)}\b", text_lower):
            issues.append(
                {
                    "type": "vague_term",
                    "description": f'"{vague}" is unmeasurable. Add a numeric metric.',
                }
            )

    for token in doc:
        if token.lower_ in AMBIGUOUS_PRONOUNS:
            if (has_parser and token.dep_ in {"nsubj", "nsubjpass", "dobj", "pobj"}) or (
                not has_parser and re.search(rf"\b{re.escape(token.lower_)}\b", text_lower)
            ):
                issues.append(
                    {
                        "type": "ambiguous_pronoun",
                        "description": f'Pronoun "{token.text}" has unclear antecedent. Use explicit nouns.',
                    }
                )
                break

    has_subject = (
        any(token.dep_ in {"nsubj", "nsubjpass", "csubj", "expl"} for token in doc)
        if has_parser
        else bool(re.search(r"\b(the\s+)?(system|application|app|user|admin|customer|service|api|module)\b", text_lower))
    )
    if not has_subject:
        issues.append(
            {
                "type": "missing_actor",
                "description": "Missing subject. Specify who or what performs the action.",
            }
        )

    has_action = (
        any(token.pos_ in {"VERB", "AUX"} for token in doc)
        if has_parser
        else bool(re.search(r"\b(shall|must|should|will|can|may)\s+\w+", text_lower))
    )
    if not has_action:
        issues.append(
            {
                "type": "missing_action",
                "description": "Missing verb. Requirements must state what the system shall do.",
            }
        )

    is_passive = has_parser and any(token.dep_ == "nsubjpass" for token in doc)
    has_agent = has_parser and any(token.dep_ == "agent" for token in doc)
    if has_parser and is_passive and not has_agent:
        issues.append(
            {
                "type": "passive_without_actor",
                "description": "Passive voice with no agent. Specify the actor.",
            }
        )

    if any(trigger in text_lower for trigger in QUALITY_TRIGGERS) and not re.search(r"\d+", text):
        issues.append(
            {
                "type": "missing_measurable",
                "description": "Quality requirement missing numeric target (e.g., <2s, 99.9%).",
            }
        )

    return issues


def _score(issues: list[dict]) -> int:
    return max(0, 100 - sum(PENALTY_WEIGHTS.get(issue["type"], 10) for issue in issues))


def _label(score: int) -> str:
    if score >= 80:
        return "good"
    if score >= 50:
        return "moderate"
    return "poor"


def analyze_requirements(requirements: list[str]) -> list[dict]:
    results = []
    for text in requirements:
        issues = _detect_issues(text)
        score = _score(issues)
        results.append({"text": text, "score": score, "label": _label(score), "issues": issues})
    return results
