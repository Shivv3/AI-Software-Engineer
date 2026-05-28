import math
import os
import re
import joblib
import numpy as np

try:
    from radon.complexity import cc_visit
    from radon.metrics import h_visit
    from radon.raw import analyze
except Exception:  # pragma: no cover
    cc_visit = None
    h_visit = None
    analyze = None

try:
    import shap
except Exception:  # pragma: no cover
    shap = None

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "defect_rf_v1.joblib")


def load_model():
    if os.path.exists(MODEL_PATH):
        return joblib.load(MODEL_PATH)
    return None


def _extract_python_functions(code: str) -> list[dict]:
    lines = code.splitlines()
    funcs = []
    current = None
    indent = None
    for line in lines:
        match = re.match(r"^(\s*)def\s+(\w+)\s*\(", line)
        if match:
            if current:
                funcs.append(current)
            indent = len(match.group(1))
            current = {"name": match.group(2), "lines": [line]}
            continue
        if current is not None:
            leading = len(line) - len(line.lstrip(" "))
            if line.strip() and leading <= indent:
                funcs.append(current)
                current = None
                indent = None
            else:
                current["lines"].append(line)
    if current:
        funcs.append(current)
    return [{"name": f["name"], "code": "\n".join(f["lines"]).strip()} for f in funcs]


def _extract_js_functions(code: str) -> list[dict]:
    funcs = []
    for match in re.finditer(r"function\s+(\w+)\s*\([^)]*\)\s*\{", code):
        funcs.append({"name": match.group(1), "code": _slice_block(code, match.start())})
    for match in re.finditer(r"const\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*=>\s*\{", code):
        funcs.append({"name": match.group(1), "code": _slice_block(code, match.start())})
    return funcs


def _slice_block(text: str, start_index: int) -> str:
    brace_count = 0
    in_block = False
    for i in range(start_index, len(text)):
        if text[i] == "{":
            brace_count += 1
            in_block = True
        elif text[i] == "}":
            brace_count -= 1
            if in_block and brace_count == 0:
                return text[start_index : i + 1]
    return text[start_index:]


def _estimate_cc(code: str) -> int:
    keywords = re.findall(r"\b(if|for|while|case|catch|elif|except)\b|&&|\|\|", code)
    return max(1, 1 + len(keywords))


def _estimate_halstead(code: str) -> tuple[float, float]:
    operators = re.findall(r"[+\-*/%]=?|==|!=|<=|>=|<|>|\b(and|or|not|in)\b", code)
    operands = re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]*\b", code)
    n1 = len(set(operators)) or 1
    n2 = len(set(operands)) or 1
    N1 = len(operators) or 1
    N2 = len(operands) or 1
    vocab = n1 + n2
    length = N1 + N2
    volume = length * math.log2(vocab)
    effort = volume * (n1 / 2)
    return volume, effort


def _calc_metrics(code: str, language: str) -> dict:
    loc = len([line for line in code.splitlines() if line.strip()])
    if language.lower() == "python" and cc_visit and h_visit and analyze:
        try:
            cc = max((block.complexity for block in cc_visit(code)), default=1)
            h = h_visit(code)
            volume = h.total.volume if h else 0
            effort = h.total.effort if h else 0
        except Exception:
            cc = _estimate_cc(code)
            volume, effort = _estimate_halstead(code)
    else:
        cc = _estimate_cc(code)
        volume, effort = _estimate_halstead(code)
    return {"cc": cc, "halstead_volume": round(volume, 2), "halstead_effort": round(effort, 2), "loc": loc}


def _risk_label(score: float) -> str:
    if score >= 0.6:
        return "High"
    if score >= 0.35:
        return "Medium"
    return "Low"


def _heuristic_score(metrics: dict) -> float:
    cc = metrics["cc"]
    loc = metrics["loc"]
    volume = metrics["halstead_volume"]
    score = (min(cc / 20, 1.0) + min(loc / 200, 1.0) + min(volume / 1200, 1.0)) / 3
    return round(min(0.95, score), 4)


def _build_explanations(metrics: dict, base_score: float) -> list[str]:
    explanations = []
    if metrics["cc"] >= 10:
        explanations.append(f"High cyclomatic complexity (+{round(base_score * 0.2, 2)} risk)")
    if metrics["halstead_volume"] >= 800:
        explanations.append(f"High Halstead volume (+{round(base_score * 0.15, 2)} risk)")
    if metrics["loc"] >= 80:
        explanations.append(f"Large LOC (+{round(base_score * 0.1, 2)} risk)")
    if not explanations:
        explanations.append("Low complexity and size reduce risk")
    return explanations


def predict_defects(code: str, language: str) -> dict:
    model = load_model()
    functions = []

    if language.lower() == "python":
        functions = _extract_python_functions(code)
    else:
        functions = _extract_js_functions(code)

    if not functions:
        return {"functions": [], "summary": {"high_risk": 0, "medium_risk": 0, "low_risk": 0}}

    metrics_list = []
    for func in functions:
        metrics_list.append(_calc_metrics(func["code"], language))

    total_functions = len(functions)
    X = np.array([
        [m["cc"], m["halstead_volume"], m["halstead_effort"], m["loc"], total_functions]
        for m in metrics_list
    ])

    results = []
    if model is not None:
        probabilities = model.predict_proba(X)[:, 1]
        explanations = None
        if shap is not None:
            try:
                explainer = shap.TreeExplainer(model)
                shap_values = explainer.shap_values(X)[1]
                explanations = shap_values
            except Exception:
                explanations = None

        for idx, func in enumerate(functions):
            score = round(float(probabilities[idx]), 4)
            metric = metrics_list[idx]
            if explanations is not None:
                contrib = explanations[idx]
                features = [
                    ("Cyclomatic complexity", contrib[0]),
                    ("Halstead volume", contrib[1]),
                    ("Halstead effort", contrib[2]),
                    ("LOC", contrib[3]),
                ]
                top = sorted(features, key=lambda item: abs(item[1]), reverse=True)[:3]
                explain = [f"{name} ({value:+.2f} impact)" for name, value in top]
            else:
                explain = _build_explanations(metric, score)

            results.append(
                {
                    "name": func["name"],
                    "risk_score": score,
                    "risk_label": _risk_label(score),
                    "metrics": metric,
                    "shap_explanation": explain,
                }
            )
    else:
        for idx, func in enumerate(functions):
            metric = metrics_list[idx]
            score = _heuristic_score(metric)
            results.append(
                {
                    "name": func["name"],
                    "risk_score": score,
                    "risk_label": _risk_label(score),
                    "metrics": metric,
                    "shap_explanation": _build_explanations(metric, score),
                }
            )

    summary = {
        "high_risk": len([r for r in results if r["risk_label"] == "High"]),
        "medium_risk": len([r for r in results if r["risk_label"] == "Medium"]),
        "low_risk": len([r for r in results if r["risk_label"] == "Low"]),
    }

    return {"functions": results, "summary": summary}
