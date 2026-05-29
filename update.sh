#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "Updating source code"
cd "$ROOT_DIR"
git pull --ff-only

echo "Updating backend"
cd "$BACKEND_DIR"
if [[ ! -x ".venv/bin/python" ]]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e ".[dev]"
.venv/bin/alembic upgrade head

echo "Updating frontend"
cd "$FRONTEND_DIR"
npm install
npm run build

echo "Update complete"
echo "Restart the app with: ./dev.sh"
