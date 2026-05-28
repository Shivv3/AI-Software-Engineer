#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/.run"

if [ ! -d "$PID_DIR" ]; then
  echo "No .run directory found. Nothing to stop."
  exit 0
fi

for pid_file in "$PID_DIR"/*.pid; do
  [ -e "$pid_file" ] || continue
  pid="$(cat "$pid_file")"
  name="$(basename "$pid_file" .pid)"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "Stopped $name ($pid)"
  else
    echo "$name was not running."
  fi
  rm -f "$pid_file"
done
