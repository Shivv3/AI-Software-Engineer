import re
from shared.spacy_loader import load_nlp

TEMPORAL_UNITS = {
    "day": 1,
    "days": 1,
    "month": 30,
    "months": 30,
    "year": 365,
    "years": 365,
}

PERMISSION_ALL = {"all users", "all customers", "everyone", "any user", "anyone"}
PERMISSION_ONLY = {"only admins", "admins only", "authorized", "authenticated", "restricted", "only"}

OFFLINE_TERMS = {"offline", "without internet", "no internet", "air gapped"}
ONLINE_TERMS = {"online", "internet", "network connection", "always connected", "requires internet"}

QUANT_METRIC_KEYWORDS = {
    "response time",
    "latency",
    "throughput",
    "availability",
    "uptime",
    "timeout",
    "requests per second",
    "rps",
    "qps",
    "seconds",
    "ms",
}

STOP_WORDS = {
    "the",
    "a",
    "an",
    "all",
    "any",
    "shall",
    "must",
    "should",
    "will",
    "may",
    "system",
    "user",
    "users",
    "data",
}


def _extract_temporal(text: str) -> list[dict]:
    matches = []
    for match in re.finditer(r"(\d+(?:\.\d+)?)\s*(day|days|month|months|year|years)", text, re.I):
        value = float(match.group(1))
        unit = match.group(2).lower()
        days = value * TEMPORAL_UNITS.get(unit, 1)
        matches.append({"value": value, "unit": unit, "days": days})
    return matches


def _extract_numbers(text: str) -> list[dict]:
    results = []
    for match in re.finditer(r"(<=|>=|<|>|under|below|within|at least|at most|max|min)?\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|sec|secs|seconds|%|percent)?", text, re.I):
        comp = (match.group(1) or "").strip().lower()
        value = float(match.group(2))
        unit = (match.group(3) or "").lower()
        if not unit and not comp:
            continue
        results.append({"value": value, "unit": unit, "comp": comp})
    return results


def _has_negation(doc) -> bool:
    return any(token.dep_ == "neg" or token.lower_ in {"no", "not", "never"} for token in doc)


def _noun_overlap(doc_a, doc_b) -> bool:
    nouns_a = {token.lemma_.lower() for token in doc_a if token.pos_ in {"NOUN", "PROPN"}}
    nouns_b = {token.lemma_.lower() for token in doc_b if token.pos_ in {"NOUN", "PROPN"}}
    if nouns_a or nouns_b:
        return bool(nouns_a.intersection(nouns_b))

    words_a = set(re.findall(r"[a-zA-Z_]+", doc_a.text.lower())) - STOP_WORDS
    words_b = set(re.findall(r"[a-zA-Z_]+", doc_b.text.lower())) - STOP_WORDS
    return bool(words_a.intersection(words_b))


def _has_permission_all(text: str) -> bool:
    text_lower = text.lower()
    return any(term in text_lower for term in PERMISSION_ALL)


def _has_permission_only(text: str) -> bool:
    text_lower = text.lower()
    return any(term in text_lower for term in PERMISSION_ONLY)


def _has_offline(text: str) -> bool:
    text_lower = text.lower()
    return any(term in text_lower for term in OFFLINE_TERMS)


def _has_online(text: str) -> bool:
    text_lower = text.lower()
    return any(term in text_lower for term in ONLINE_TERMS)


def _has_quant_metric(text: str) -> bool:
    text_lower = text.lower()
    return any(term in text_lower for term in QUANT_METRIC_KEYWORDS)


def classify_conflict(text_a: str, text_b: str) -> tuple[str, float, dict]:
    nlp = load_nlp()
    doc_a = nlp(text_a)
    doc_b = nlp(text_b)

    evidence = {
        "negation_a": _has_negation(doc_a),
        "negation_b": _has_negation(doc_b),
        "temporal_a": _extract_temporal(text_a),
        "temporal_b": _extract_temporal(text_b),
        "numbers_a": _extract_numbers(text_a),
        "numbers_b": _extract_numbers(text_b),
    }

    if (_has_offline(text_a) and _has_online(text_b)) or (_has_offline(text_b) and _has_online(text_a)):
        return "existence", 0.6, evidence

    if (_has_permission_all(text_a) and _has_permission_only(text_b)) or (
        _has_permission_all(text_b) and _has_permission_only(text_a)
    ):
        return "permission", 0.6, evidence

    if evidence["temporal_a"] and evidence["temporal_b"]:
        days_a = max(item["days"] for item in evidence["temporal_a"])
        days_b = max(item["days"] for item in evidence["temporal_b"])
        ratio = max(days_a, days_b) / max(1, min(days_a, days_b))
        if ratio >= 3:
            return "temporal", 0.8, evidence

    if _has_quant_metric(text_a) and _has_quant_metric(text_b) and evidence["numbers_a"] and evidence["numbers_b"]:
        value_a = min(item["value"] for item in evidence["numbers_a"])
        value_b = min(item["value"] for item in evidence["numbers_b"])
        if value_a != value_b:
            return "quantitative", 0.7, evidence

    if evidence["negation_a"] != evidence["negation_b"] and _noun_overlap(doc_a, doc_b):
        return "direct_negation", 1.0, evidence

    return "", 0.0, evidence
