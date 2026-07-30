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

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/vinaris}"
POSTGRES_DB="${POSTGRES_DB:-winecellarmulti}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
LOCAL_RETENTION_DAYS="${LOCAL_BACKUP_RETENTION_DAYS:-14}"
REMOTE_RETENTION_DAYS="${REMOTE_BACKUP_RETENTION_DAYS:-30}"
REMOTE_PATH="${BACKUP_REMOTE_PATH:-}"
PHOTO_SOURCE_SETTING="${WINE_PHOTO_BACKUP_PATH:-backend/data/wine-photos}"

require_command docker
require_command tar
require_command sha256sum
require_command find

if [[ "$PHOTO_SOURCE_SETTING" = /* ]]; then
  PHOTO_SOURCE="$(realpath -m "$PHOTO_SOURCE_SETTING")"
else
  PHOTO_SOURCE="$(realpath -m "$ROOT_DIR/$PHOTO_SOURCE_SETTING")"
fi
if [[ "$PHOTO_SOURCE" == "/" || "$PHOTO_SOURCE" == "$ROOT_DIR" ]]; then
  echo "Unsafe WINE_PHOTO_BACKUP_PATH: $PHOTO_SOURCE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="vinaris_${timestamp}.tar.gz"
backup_path="$BACKUP_DIR/$backup_name"
tmp_path="$backup_path.tmp"
stage_dir="$(mktemp -d "$BACKUP_DIR/.vinaris-backup-stage.XXXXXX")"
verify_dir="$(mktemp -d "$BACKUP_DIR/.vinaris-backup-verify.XXXXXX")"

cleanup() {
  rm -f "$tmp_path"
  rm -rf "$stage_dir" "$verify_dir"
}
trap cleanup EXIT

cd "$ROOT_DIR"

echo "Creating PostgreSQL backup"
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges \
  > "$stage_dir/database.dump"

if [[ ! -s "$stage_dir/database.dump" ]]; then
  echo "Database backup is empty" >&2
  exit 1
fi

echo "Verifying PostgreSQL backup catalog"
docker compose exec -T postgres pg_restore --list < "$stage_dir/database.dump" >/dev/null

wine_photo_sets=0
library_photo_sets=0
wine_photo_column_exists="$(
  docker compose exec -T postgres psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -At \
    -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wines' AND column_name = 'photo_version';"
)"
if [[ "${wine_photo_column_exists//$'\r'/}" == "1" ]]; then
  wine_photo_sets="$(
    docker compose exec -T postgres psql \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      -At \
      -v ON_ERROR_STOP=1 \
      -c "SELECT count(*) FROM wines WHERE photo_version <> '';"
  )"
fi
library_table_exists="$(
  docker compose exec -T postgres psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -At \
    -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wine_photo_library_entries';"
)"
if [[ "${library_table_exists//$'\r'/}" == "1" ]]; then
  library_photo_sets="$(
    docker compose exec -T postgres psql \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      -At \
      -v ON_ERROR_STOP=1 \
      -c "SELECT count(*) FROM wine_photo_library_entries;"
  )"
fi
wine_photo_sets="${wine_photo_sets//$'\r'/}"
wine_photo_sets="${wine_photo_sets//$'\n'/}"
library_photo_sets="${library_photo_sets//$'\r'/}"
library_photo_sets="${library_photo_sets//$'\n'/}"
if [[ ! "$wine_photo_sets" =~ ^[0-9]+$ || ! "$library_photo_sets" =~ ^[0-9]+$ ]]; then
  echo "Unable to determine the number of photo records" >&2
  exit 1
fi
expected_photo_sets=$((wine_photo_sets + library_photo_sets))

mkdir -p "$stage_dir/wine-photos"
if [[ -d "$PHOTO_SOURCE" ]]; then
  echo "Copying wine photographs from $PHOTO_SOURCE"
  cp -a "$PHOTO_SOURCE"/. "$stage_dir/wine-photos/"
elif (( expected_photo_sets > 0 )); then
  echo "Photo storage does not exist, but the database references $expected_photo_sets photo sets: $PHOTO_SOURCE" >&2
  exit 1
else
  echo "Photo storage is absent and the database contains no photo references; storing an empty photo directory"
fi

thumbnail_count="$(find "$stage_dir/wine-photos" -type f -name thumbnail.png | wc -l | tr -d ' ')"
detail_count="$(find "$stage_dir/wine-photos" -type f -name detail.png | wc -l | tr -d ' ')"
if (( thumbnail_count < expected_photo_sets || detail_count < expected_photo_sets )); then
  echo "Photo backup is incomplete: database sets=$expected_photo_sets thumbnails=$thumbnail_count details=$detail_count" >&2
  exit 1
fi

cat > "$stage_dir/backup.meta" <<EOF
format_version=1
created_at_utc=$timestamp
database=$POSTGRES_DB
photo_sets_expected=$expected_photo_sets
photo_thumbnails=$thumbnail_count
photo_details=$detail_count
EOF

echo "Creating checksums and backup bundle"
(
  cd "$stage_dir"
  find backup.meta database.dump wine-photos -type f -print0 \
    | sort -z \
    | xargs -0 sha256sum > manifest.sha256
)
tar -C "$stage_dir" -czf "$tmp_path" backup.meta manifest.sha256 database.dump wine-photos

echo "Verifying completed bundle"
tar -xzf "$tmp_path" -C "$verify_dir"
(
  cd "$verify_dir"
  sha256sum -c manifest.sha256 >/dev/null
)
docker compose exec -T postgres pg_restore --list < "$verify_dir/database.dump" >/dev/null

mv "$tmp_path" "$backup_path"
chmod 600 "$backup_path"

echo "Pruning local bundles older than ${LOCAL_RETENTION_DAYS} days"
find "$BACKUP_DIR" -type f -name "vinaris_*.tar.gz" -mtime "+$LOCAL_RETENTION_DAYS" -print -delete

if [[ -n "$REMOTE_PATH" ]]; then
  require_command rclone

  remote_target="${REMOTE_PATH%/}/$backup_name"
  echo "Uploading backup to $remote_target"
  rclone copyto "$backup_path" "$remote_target" --checksum

  echo "Pruning remote bundles older than ${REMOTE_RETENTION_DAYS} days"
  rclone delete "$REMOTE_PATH" \
    --include "vinaris_*.tar.gz" \
    --min-age "${REMOTE_RETENTION_DAYS}d"
else
  echo "BACKUP_REMOTE_PATH is not set; remote upload skipped"
fi

echo "Backup complete: $backup_path"
