#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "Updating source code"
cd "$ROOT_DIR"
git pull --ff-only

if [[ ! -f "$ROOT_DIR/.env" || ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Missing local environment files." >&2
  echo "Run ./setup-env.sh before updating, or ./setup-env.sh --force to regenerate local secrets." >&2
  exit 1
fi

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

restart_service_if_available() {
  local service_name="$1"

  if ! command -v systemctl >/dev/null 2>&1; then
    return 1
  fi

  if ! systemctl list-unit-files "$service_name.service" --no-legend 2>/dev/null | grep -q "^$service_name.service"; then
    return 1
  fi

  echo "Restarting $service_name"
  sudo systemctl restart "$service_name"
  sudo systemctl --no-pager --full status "$service_name" | sed -n '1,8p'
  return 0
}

echo "Restarting services when installed"
RESTARTED=false
if restart_service_if_available winecellarmulti-backend; then
  RESTARTED=true
fi

if command -v nginx >/dev/null 2>&1; then
  echo "Validating and reloading nginx"
  sudo nginx -t
  sudo systemctl reload nginx
  RESTARTED=true
fi

echo "Update complete"
if [[ "$RESTARTED" == "false" ]]; then
  echo "No systemd services found. Restart the development app with: ./dev.sh"
fi
