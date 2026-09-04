#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
FORCE=false

usage() {
  echo "Usage: ./update.sh [--force]"
  echo "  --force  Rebuild the frontend and restart the backend even when no matching source changes are detected."
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
  shift
done

echo "Updating source code"
cd "$ROOT_DIR"
PREVIOUS_REVISION="$(git rev-parse HEAD)"
git pull --ff-only

if [[ "$FORCE" == "true" ]]; then
  echo "Force mode: frontend build and backend restart will run."
fi

changed_since_update() {
  ! git -C "$ROOT_DIR" diff --quiet "$PREVIOUS_REVISION" HEAD -- "$@"
}

if [[ ! -f "$ROOT_DIR/.env" || ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Missing local environment files." >&2
  echo "Run ./setup-env.sh before updating, or ./setup-env.sh --force to regenerate local secrets." >&2
  exit 1
fi

cd "$BACKEND_DIR"
BACKEND_VENV_CREATED=false
if [[ ! -x ".venv/bin/python" ]]; then
  python3 -m venv .venv
  BACKEND_VENV_CREATED=true
fi
BACKEND_DEPENDENCIES_NEEDED=false
if [[ "$BACKEND_VENV_CREATED" == "true" ]] \
  || changed_since_update backend/pyproject.toml; then
  BACKEND_DEPENDENCIES_NEEDED=true
  echo "Updating backend dependencies"
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -e ".[dev,photo-ai]"
  echo "Checking bottle photo AI installation"
  .venv/bin/python -c 'import rembg'
else
  echo "Backend dependencies unchanged; skipping pip install"
fi

MIGRATIONS_NEEDED=false
if [[ "$BACKEND_VENV_CREATED" == "true" ]] \
  || changed_since_update backend/alembic; then
  MIGRATIONS_NEEDED=true
  echo "Applying database migrations"
  .venv/bin/alembic upgrade head
else
  echo "Database migrations unchanged; skipping Alembic"
fi

cd "$FRONTEND_DIR"
FRONTEND_DEPENDENCIES_NEEDED=false
if [[ ! -d "node_modules" || ! -f "node_modules/.package-lock.json" ]] \
  || changed_since_update frontend/package.json frontend/package-lock.json; then
  FRONTEND_DEPENDENCIES_NEEDED=true
  echo "Installing frontend dependencies"
  npm ci --no-audit --no-fund --prefer-offline
else
  echo "Frontend dependencies unchanged; skipping npm install"
fi

FRONTEND_BUILD_NEEDED=false
if [[ "$FORCE" == "true" || ! -d "dist" || "$FRONTEND_DEPENDENCIES_NEEDED" == "true" ]] \
  || changed_since_update frontend/src frontend/public frontend/scripts frontend/index.html frontend/vite.config.ts frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json; then
  FRONTEND_BUILD_NEEDED=true
  echo "Building frontend"
  npm run build
else
  echo "Frontend source unchanged; skipping build"
fi

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

BACKEND_RESTART_NEEDED=false
if [[ "$FORCE" == "true" || "$BACKEND_VENV_CREATED" == "true" || "$BACKEND_DEPENDENCIES_NEEDED" == "true" || "$MIGRATIONS_NEEDED" == "true" ]] \
  || changed_since_update backend/app; then
  BACKEND_RESTART_NEEDED=true
fi

SERVICES_UPDATED=false
if [[ "$BACKEND_RESTART_NEEDED" == "true" ]]; then
  if restart_service_if_available winecellarmulti-backend; then
    SERVICES_UPDATED=true
  fi
else
  echo "Backend source unchanged; skipping service restart"
fi

if changed_since_update deploy/systemd/vinaris-wine-pulse.service deploy/systemd/vinaris-wine-pulse.timer \
  && command -v systemctl >/dev/null 2>&1 \
  && systemctl list-unit-files winecellarmulti-backend.service --no-legend 2>/dev/null | grep -q '^winecellarmulti-backend.service'; then
  echo "Installing Wine Pulse collector timer"
  sudo install -m 0644 "$ROOT_DIR/deploy/systemd/vinaris-wine-pulse.service" /etc/systemd/system/vinaris-wine-pulse.service
  sudo install -m 0644 "$ROOT_DIR/deploy/systemd/vinaris-wine-pulse.timer" /etc/systemd/system/vinaris-wine-pulse.timer
  sudo systemctl daemon-reload
  sudo systemctl enable vinaris-wine-pulse.timer
  sudo systemctl restart vinaris-wine-pulse.timer
  SERVICES_UPDATED=true
fi

if changed_since_update deploy/nginx \
  && command -v nginx >/dev/null 2>&1; then
  echo "Validating and reloading nginx"
  sudo nginx -t
  sudo systemctl reload nginx
  SERVICES_UPDATED=true
fi

echo "Update complete"
if [[ "$SERVICES_UPDATED" == "false" ]]; then
  echo "No runtime service restart was needed."
fi
