#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"
ROOT_ENV="$ROOT_DIR/.env"
FORCE="${1:-}"

if [[ -f "$ROOT_ENV" || -f "$BACKEND_ENV" ]] && [[ "$FORCE" != "--force" ]]; then
  echo "Refusing to overwrite existing .env files." >&2
  echo "Use ./setup-env.sh --force only if you want to regenerate local secrets." >&2
  exit 1
fi

read_secret() {
  python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(36))
PY
}

POSTGRES_PASSWORD="$(read_secret)"
SECRET_KEY="$(read_secret)"

cat > "$ROOT_ENV" <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
SECRET_KEY=$SECRET_KEY
EOF

cat > "$BACKEND_ENV" <<EOF
APP_NAME=WineCellarMulti
APP_ENV=development
APP_DEBUG=true
DATABASE_URL=postgresql+psycopg://postgres:$POSTGRES_PASSWORD@localhost:5433/winecellarmulti
SECRET_KEY=$SECRET_KEY
SESSION_COOKIE_NAME=winecellarmulti_session
SESSION_COOKIE_SECURE=false
SESSION_TTL_DAYS=30
INVITE_TTL_DAYS=7
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_AI_NOTES_MODEL=gpt-5.4-mini
OPENAI_DRINK_WINDOW_MODEL=gpt-5.4
OPENAI_VALUE_MODEL=gpt-5.4-mini
OPENAI_GRAPE_MODEL=gpt-5.4-nano
OPENAI_WISHLIST_MODEL=gpt-5.4
OPENAI_PAIRING_MODEL=gpt-5.4
EOF

chmod 600 "$ROOT_ENV" "$BACKEND_ENV"

echo "Generated:"
echo "  $ROOT_ENV"
echo "  $BACKEND_ENV"
