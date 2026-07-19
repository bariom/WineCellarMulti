#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

INSTALL_SERVICES=false
BUILD_FRONTEND=false

for arg in "$@"; do
  case "$arg" in
    --install-services)
      INSTALL_SERVICES=true
      ;;
    --build)
      BUILD_FRONTEND=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./start.sh [--install-services] [--build]

Starts the production stack after a reboot or outage:
  - starts PostgreSQL with Docker Compose
  - runs backend migrations
  - optionally installs/enables the backend systemd service
  - builds the frontend when needed
  - serves the frontend build directly through nginx

Options:
  --install-services  Copy and enable the bundled systemd units.
  --build             Force a frontend production build.
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose "$@"
}

require_command docker
require_command systemctl

if [[ ! -f "$ROOT_DIR/.env" || ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Missing .env files. Run ./setup-env.sh first." >&2
  exit 1
fi

if [[ "$INSTALL_SERVICES" == "true" ]]; then
  echo "Installing backend systemd service"
  sudo cp "$ROOT_DIR/deploy/systemd/winecellarmulti-backend.service" /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable winecellarmulti-backend
fi

echo "Starting PostgreSQL"
cd "$ROOT_DIR"
compose up -d postgres

echo "Waiting for PostgreSQL"
for attempt in {1..30}; do
  if compose exec -T postgres pg_isready -U postgres -d winecellarmulti >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    echo "PostgreSQL did not become ready in time." >&2
    compose logs --tail=80 postgres >&2
    exit 1
  fi
  sleep 2
done

echo "Preparing backend"
cd "$BACKEND_DIR"
if [[ ! -x ".venv/bin/python" ]]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e ".[dev,photo-ai]"
echo "Checking bottle photo AI model"
.venv/bin/python -c 'from app.core.config import settings; from app.services.bottle_photo_ai import warm_bottle_photo_model; warm_bottle_photo_model(settings.wine_photo_ai_model) if settings.wine_photo_ai_enabled else None'
.venv/bin/alembic upgrade head

echo "Preparing frontend"
cd "$FRONTEND_DIR"
if [[ ! -d "node_modules" ]]; then
  npm install
fi
if [[ "$BUILD_FRONTEND" == "true" || ! -d "dist" ]]; then
  npm run build
fi

echo "Restarting backend and reloading nginx"
sudo systemctl restart winecellarmulti-backend
sudo nginx -t
sudo systemctl reload nginx

echo "Checking backend service"
sudo systemctl --no-pager --full status winecellarmulti-backend | sed -n '1,12p'

echo "WineCellarMulti is started."
