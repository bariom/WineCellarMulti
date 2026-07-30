#!/usr/bin/env bash
set -euo pipefail

# One-time migration from the legacy Docker named volume to the host directory
# consumed by backup-db.sh. It can read either the running legacy backend or
# its remaining named volume after a failed/replaced container recreation.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

PHOTO_TARGET_SETTING="${WINE_PHOTO_BACKUP_PATH:-backend/data/wine-photos}"
if [[ "$PHOTO_TARGET_SETTING" = /* ]]; then
  PHOTO_TARGET="$(realpath -m "$PHOTO_TARGET_SETTING")"
else
  PHOTO_TARGET="$(realpath -m "$ROOT_DIR/$PHOTO_TARGET_SETTING")"
fi

if [[ "$PHOTO_TARGET" == "/" || "$PHOTO_TARGET" == "$ROOT_DIR" ]]; then
  echo "Unsafe WINE_PHOTO_BACKUP_PATH: $PHOTO_TARGET" >&2
  exit 1
fi

require_command docker
require_command find
require_command realpath

cd "$ROOT_DIR"
source_volume="${LEGACY_PHOTO_VOLUME:-}"
if [[ -z "$source_volume" ]]; then
  backend_id="$(docker compose ps -aq backend | head -n 1 || true)"
  if [[ -n "$backend_id" ]]; then
    source_volume="$(docker inspect --format '{{range .Mounts}}{{if and (eq .Type "volume") (eq .Destination "/data/wine-photos")}}{{.Name}}{{end}}{{end}}' "$backend_id")"
  fi
fi
if [[ -z "$source_volume" ]]; then
  compose_project="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT_DIR" | tr '[:upper:]' '[:lower:]')}"
  source_volume="$(docker volume ls -q \
    --filter "label=com.docker.compose.project=$compose_project" \
    --filter "label=com.docker.compose.volume=wine-photo-data" \
    | head -n 1 || true)"
fi
if [[ -z "$source_volume" ]]; then
  echo "Legacy photo volume not found. Set LEGACY_PHOTO_VOLUME to its exact Docker volume name." >&2
  exit 1
fi
if ! docker volume inspect "$source_volume" >/dev/null 2>&1; then
  echo "Legacy photo volume does not exist: $source_volume" >&2
  exit 1
fi

if [[ -e "$PHOTO_TARGET" ]] && [[ -n "$(find "$PHOTO_TARGET" -mindepth 1 -print -quit)" ]]; then
  echo "Target photo directory is not empty: $PHOTO_TARGET" >&2
  echo "Refusing to merge storage. Move it aside or verify that it is already the active storage." >&2
  exit 1
fi

mkdir -p "$PHOTO_TARGET"
echo "Copying photos from Docker volume '$source_volume' to '$PHOTO_TARGET'"
docker run --rm \
  -v "$source_volume:/source:ro" \
  -v "$PHOTO_TARGET:/target" \
  alpine:3.21 \
  sh -euc 'cp -a /source/. /target/'

source_count="$(docker run --rm -v "$source_volume:/source:ro" alpine:3.21 sh -c 'find /source -type f | wc -l' | tr -d '[:space:]')"
target_count="$(find "$PHOTO_TARGET" -type f | wc -l | tr -d '[:space:]')"
if [[ "$source_count" != "$target_count" ]]; then
  echo "Photo migration verification failed: source=$source_count target=$target_count" >&2
  exit 1
fi

echo "Photo migration complete: $target_count files copied."
echo "Next: docker compose up -d --build --force-recreate backend"
echo "Do not remove Docker volume '$source_volume' until a backup and restore verification both succeed."
