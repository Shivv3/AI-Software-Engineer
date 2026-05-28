#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/.run"
PYTHON_BIN="${PYTHON_BIN:-python}"
mkdir -p "$PID_DIR"

if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Created .env from .env.example. Add GEMINI_API_KEY or GROQ_API_KEY for AI generation routes."
fi

npm --prefix "$ROOT/backend" install
npm --prefix "$ROOT/frontend" install

if [ ! -d "$ROOT/ml-service/.venv" ]; then
  "$PYTHON_BIN" -m venv "$ROOT/ml-service/.venv"
fi

if [ -x "$ROOT/ml-service/.venv/bin/python" ]; then
  PY="$ROOT/ml-service/.venv/bin/python"
else
  PY="$ROOT/ml-service/.venv/Scripts/python.exe"
fi

"$PY" -m pip install --upgrade pip
"$PY" -m pip install -r "$ROOT/ml-service/requirements.txt"

(
  cd "$ROOT/ml-service"
  PYTHON_BIN="$PY" bash scripts/download_models.sh
)

if [ ! -f "$ROOT/ml-service/models/defect_rf_v1.joblib" ]; then
  (cd "$ROOT/ml-service" && "$PY" train_defect_model.py)
fi

(cd "$ROOT/ml-service" && "$PY" -m uvicorn main:app --host 127.0.0.1 --port 8000 > "$PID_DIR/ml-service.log" 2>&1 & echo $! > "$PID_DIR/ml-service.pid")
(cd "$ROOT/backend" && node server.js > "$PID_DIR/backend.log" 2>&1 & echo $! > "$PID_DIR/backend.pid")

echo "ML service: http://127.0.0.1:8000"
echo "Backend: http://localhost:4000"
echo "Frontend will run in the foreground:"
npm --prefix "$ROOT/frontend" run dev
