#!/usr/bin/env bash
set -euo pipefail

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

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
POSTGRES_DB="${POSTGRES_DB:-winecellarmulti}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
LOCAL_RETENTION_DAYS="${LOCAL_BACKUP_RETENTION_DAYS:-14}"
REMOTE_RETENTION_DAYS="${REMOTE_BACKUP_RETENTION_DAYS:-30}"
REMOTE_PATH="${BACKUP_REMOTE_PATH:-}"

require_command docker
require_command gzip

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="${POSTGRES_DB}_${timestamp}.dump.gz"
backup_path="$BACKUP_DIR/$backup_name"
tmp_path="$backup_path.tmp"

cleanup_tmp() {
  rm -f "$tmp_path"
}
trap cleanup_tmp EXIT

cd "$ROOT_DIR"

echo "Creating PostgreSQL backup: $backup_path"
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges \
  | gzip -9 > "$tmp_path"

if [[ ! -s "$tmp_path" ]]; then
  echo "Backup file is empty: $tmp_path" >&2
  exit 1
fi

echo "Verifying backup catalog"
gzip -dc "$tmp_path" | docker compose exec -T postgres pg_restore --list >/dev/null

mv "$tmp_path" "$backup_path"
chmod 600 "$backup_path"

echo "Pruning local backups older than ${LOCAL_RETENTION_DAYS} days"
find "$BACKUP_DIR" -type f -name "${POSTGRES_DB}_*.dump.gz" -mtime "+$LOCAL_RETENTION_DAYS" -print -delete

if [[ -n "$REMOTE_PATH" ]]; then
  require_command rclone

  remote_target="${REMOTE_PATH%/}/$backup_name"
  echo "Uploading backup to $remote_target"
  rclone copyto "$backup_path" "$remote_target" --checksum

  echo "Pruning remote backups older than ${REMOTE_RETENTION_DAYS} days"
  rclone delete "$REMOTE_PATH" \
    --include "${POSTGRES_DB}_*.dump.gz" \
    --min-age "${REMOTE_RETENTION_DAYS}d"
else
  echo "BACKUP_REMOTE_PATH is not set; remote upload skipped"
fi

echo "Backup complete: $backup_path"
