#!/usr/bin/env bash
set -e
PYTHON_BIN="${PYTHON_BIN:-python}"

"$PYTHON_BIN" - <<'PY'
import spacy
try:
    spacy.load("en_core_web_sm")
    print("spaCy model already installed")
except Exception:
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
    print("spaCy model downloaded")
PY

"$PYTHON_BIN" - <<'PY'
from pathlib import Path
cache_dir = Path("model_cache")
cache_dir.mkdir(exist_ok=True)

try:
    from sentence_transformers import SentenceTransformer
    SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", cache_folder=str(cache_dir))
    print("SBERT all-MiniLM-L6-v2 ready")
except Exception as exc:
    raise SystemExit(f"Failed to prepare SBERT model: {exc}")
PY
