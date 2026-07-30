#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
backup_path="${1:-}"

if [[ -z "$backup_path" || ! -f "$backup_path" ]]; then
  echo "Usage: scripts/verify-backup.sh /path/to/vinaris_YYYYMMDDTHHMMSSZ.tar.gz" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-postgres}"
verify_database="vinaris_restore_verify_$(date -u +%Y%m%d%H%M%S)_$$"
verify_dir="$(mktemp -d "${TMPDIR:-/tmp}/vinaris-verify.XXXXXX")"

cleanup() {
  cd "$ROOT_DIR"
  docker compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$verify_database" >/dev/null 2>&1 || true
  rm -rf "$verify_dir"
}
trap cleanup EXIT

if tar -tzf "$backup_path" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Backup contains unsafe paths" >&2
  exit 1
fi
tar -xzf "$backup_path" -C "$verify_dir"
(
  cd "$verify_dir"
  sha256sum -c manifest.sha256
)

cd "$ROOT_DIR"
docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$verify_database"
docker compose exec -T postgres pg_restore \
  -U "$POSTGRES_USER" \
  -d "$verify_database" \
  --no-owner \
  --no-privileges \
  < "$verify_dir/database.dump"

schema_version="$(
  docker compose exec -T postgres psql \
    -U "$POSTGRES_USER" \
    -d "$verify_database" \
    -At \
    -v ON_ERROR_STOP=1 \
    -c "SELECT version_num FROM alembic_version;"
)"
user_count="$(
  docker compose exec -T postgres psql \
    -U "$POSTGRES_USER" \
    -d "$verify_database" \
    -At \
    -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM users;"
)"
photo_files="$(find "$verify_dir/wine-photos" -type f | wc -l | tr -d ' ')"

echo "Disposable restore verified successfully"
echo "Alembic version: ${schema_version//$'\r'/}"
echo "Users restored: ${user_count//$'\r'/}"
echo "Photo files verified: $photo_files"
