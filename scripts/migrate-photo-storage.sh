#!/usr/bin/env bash
set -euo pipefail

# One-time migration from the legacy Docker named volume to the host directory
# consumed by backup-db.sh. Run this after pulling the release, but before
# recreating the backend with the new bind mount.

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
backend_id="$(docker compose ps -q backend)"
if [[ -z "$backend_id" ]]; then
  echo "The legacy backend container is not running. Start it with the old named-volume configuration before migrating." >&2
  exit 1
fi

source_volume="$(docker inspect --format '{{range .Mounts}}{{if and (eq .Type "volume") (eq .Destination "/data/wine-photos")}}{{.Name}}{{end}}{{end}}' "$backend_id")"
if [[ -z "$source_volume" ]]; then
  echo "No legacy named photo volume is attached to the running backend; migration is not required." >&2
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
