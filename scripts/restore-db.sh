#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

usage() {
  cat <<'EOF'
Usage: scripts/restore-db.sh /path/to/vinaris_YYYYMMDDTHHMMSSZ.tar.gz

Restores PostgreSQL and the wine-photo store from a verified Vinaris bundle.
The application backend must be stopped before running this command.
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

backup_path="${1:-}"
if [[ -z "$backup_path" || "$backup_path" == "-h" || "$backup_path" == "--help" ]]; then
  usage
  exit 0
fi
if [[ ! -f "$backup_path" ]]; then
  echo "Backup file not found: $backup_path" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

POSTGRES_DB="${POSTGRES_DB:-winecellarmulti}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
PHOTO_TARGET_SETTING="${WINE_PHOTO_BACKUP_PATH:-backend/data/wine-photos}"

require_command docker
require_command tar
require_command sha256sum

if [[ "$PHOTO_TARGET_SETTING" = /* ]]; then
  PHOTO_TARGET="$(realpath -m "$PHOTO_TARGET_SETTING")"
else
  PHOTO_TARGET="$(realpath -m "$ROOT_DIR/$PHOTO_TARGET_SETTING")"
fi
if [[ "$PHOTO_TARGET" == "/" || "$PHOTO_TARGET" == "$ROOT_DIR" ]]; then
  echo "Unsafe WINE_PHOTO_BACKUP_PATH: $PHOTO_TARGET" >&2
  exit 1
fi

restore_dir="$(mktemp -d "${TMPDIR:-/tmp}/vinaris-restore.XXXXXX")"
cleanup() {
  rm -rf "$restore_dir"
}
trap cleanup EXIT

cd "$ROOT_DIR"
if ! tar -tzf "$backup_path" >/dev/null 2>&1; then
  require_command gzip
  echo "Legacy database-only backup detected"
  gzip -dc "$backup_path" | docker compose exec -T postgres pg_restore --list >/dev/null
  echo "This legacy file does not contain photographs."
  read -r -p "Type RESTORE LEGACY $POSTGRES_DB to restore only the database: " confirmation
  if [[ "$confirmation" != "RESTORE LEGACY $POSTGRES_DB" ]]; then
    echo "Restore cancelled"
    exit 1
  fi
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();"
  docker compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
  docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
  gzip -dc "$backup_path" | docker compose exec -T postgres pg_restore \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --no-owner \
    --no-privileges
  echo "Legacy database restore complete; photographs were not changed"
  exit 0
fi

echo "Inspecting backup bundle"
if tar -tzf "$backup_path" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Backup contains unsafe paths" >&2
  exit 1
fi
tar -xzf "$backup_path" -C "$restore_dir"
for required in backup.meta manifest.sha256 database.dump wine-photos; do
  if [[ ! -e "$restore_dir/$required" ]]; then
    echo "Backup is missing $required" >&2
    exit 1
  fi
done

format_version="$(sed -n 's/^format_version=//p' "$restore_dir/backup.meta")"
if [[ "$format_version" != "1" ]]; then
  echo "Unsupported backup format version: ${format_version:-missing}" >&2
  exit 1
fi

echo "Verifying checksums and PostgreSQL catalog"
(
  cd "$restore_dir"
  sha256sum -c manifest.sha256
)
cd "$ROOT_DIR"
docker compose exec -T postgres pg_restore --list < "$restore_dir/database.dump" >/dev/null

echo "About to overwrite database '$POSTGRES_DB' and photo storage '$PHOTO_TARGET'."
read -r -p "Type RESTORE $POSTGRES_DB WITH PHOTOS to continue: " confirmation
if [[ "$confirmation" != "RESTORE $POSTGRES_DB WITH PHOTOS" ]]; then
  echo "Restore cancelled"
  exit 1
fi

echo "Terminating active database connections"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();"

echo "Recreating database"
docker compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "Restoring database"
docker compose exec -T postgres pg_restore \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner \
  --no-privileges \
  < "$restore_dir/database.dump"

photo_parent="$(dirname "$PHOTO_TARGET")"
photo_name="$(basename "$PHOTO_TARGET")"
mkdir -p "$photo_parent"
pre_restore_path="$photo_parent/${photo_name}.pre-restore.$(date -u +%Y%m%dT%H%M%SZ)"

echo "Replacing photo storage"
if [[ -e "$PHOTO_TARGET" ]]; then
  mv "$PHOTO_TARGET" "$pre_restore_path"
fi
if ! mv "$restore_dir/wine-photos" "$PHOTO_TARGET"; then
  echo "Unable to install restored photos; attempting to recover the previous photo directory" >&2
  if [[ -e "$pre_restore_path" && ! -e "$PHOTO_TARGET" ]]; then
    mv "$pre_restore_path" "$PHOTO_TARGET"
  fi
  exit 1
fi

echo "Restore complete"
if [[ -e "$pre_restore_path" ]]; then
  echo "Previous photos retained at: $pre_restore_path"
  echo "Remove that directory only after validating the restored application."
fi
