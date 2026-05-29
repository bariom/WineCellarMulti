#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

if [[ ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
  echo "Backend virtualenv not found. Create it first:" >&2
  echo "  cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -e \".[dev]\"" >&2
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Frontend dependencies not found. Install them first:" >&2
  echo "  cd frontend && npm install" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting backend on http://0.0.0.0:8000"
(
  cd "$BACKEND_DIR"
  .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

echo "Starting frontend on http://0.0.0.0:5173"
(
  cd "$FRONTEND_DIR"
  npm run dev -- --host 0.0.0.0 --port 5173
) &
FRONTEND_PID=$!

wait -n "$BACKEND_PID" "$FRONTEND_PID"
