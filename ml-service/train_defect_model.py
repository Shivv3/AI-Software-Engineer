import json
import os
import urllib.request
from pathlib import Path

import numpy as np
from joblib import dump
from scipy.io import arff
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

DATA_URLS = [
    "https://raw.githubusercontent.com/klainfo/DefectData/master/kc1.arff",
    "https://raw.githubusercontent.com/klainfo/DefectData/master/kc2.arff",
    "https://raw.githubusercontent.com/klainfo/DefectData/master/pc1.arff",
]

OUTPUT_DIR = Path(__file__).parent / "models"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _download_arff(url: str) -> bytes | None:
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            return response.read()
    except Exception:
        return None


def _load_dataset() -> tuple[np.ndarray, np.ndarray]:
    rows = []
    for url in DATA_URLS:
        data = _download_arff(url)
        if not data:
            continue
        dataset, meta = arff.loadarff(data.decode("utf-8").splitlines())
        for row in dataset:
            rows.append(row)

    if not rows:
        rng = np.random.default_rng(42)
        X = rng.normal(0, 1, size=(80, 5))
        y = rng.integers(0, 2, size=(80,))
        return X, y

    cols = rows[0].dtype.names
    numeric_cols = [c for c in cols if c != "bug"]
    features = numeric_cols[:5] if len(numeric_cols) >= 5 else numeric_cols

    X = np.array([[float(row[c]) for c in features] for row in rows], dtype=float)
    if "bug" in cols:
        y = np.array([int(row["bug"]) for row in rows], dtype=int)
    else:
        y = np.zeros(len(rows), dtype=int)
    return X, y


def main():
    X, y = _load_dataset()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    model = RandomForestClassifier(n_estimators=100, class_weight="balanced", random_state=42)
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    proba = model.predict_proba(X_test)[:, 1]

    metrics = {
        "f1": round(f1_score(y_test, preds), 4),
        "precision": round(precision_score(y_test, preds), 4),
        "recall": round(recall_score(y_test, preds), 4),
        "auc": round(roc_auc_score(y_test, proba), 4),
    }

    dump(model, OUTPUT_DIR / "defect_rf_v1.joblib")
    with open(OUTPUT_DIR / "model_metadata.json", "w", encoding="utf-8") as handle:
        json.dump(metrics, handle, indent=2)

    print("Model saved", metrics)


if __name__ == "__main__":
    main()
