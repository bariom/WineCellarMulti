#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

usage() {
  cat <<'EOF'
Usage: scripts/restore-db.sh /path/to/winecellarmulti_YYYYMMDDTHHMMSSZ.dump.gz

Restores a PostgreSQL custom-format dump into the Docker Compose postgres service.
This drops and recreates objects in the target database.
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

require_command docker
require_command gzip

echo "Verifying backup catalog"
cd "$ROOT_DIR"
gzip -dc "$backup_path" | docker compose exec -T postgres pg_restore --list >/dev/null

echo "About to restore into database '$POSTGRES_DB'. This will overwrite existing data."
read -r -p "Type RESTORE $POSTGRES_DB to continue: " confirmation
if [[ "$confirmation" != "RESTORE $POSTGRES_DB" ]]; then
  echo "Restore cancelled"
  exit 1
fi

echo "Terminating active database connections"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();"

echo "Recreating database"
docker compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "Restoring backup"
gzip -dc "$backup_path" | docker compose exec -T postgres pg_restore \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges

echo "Restore complete"
