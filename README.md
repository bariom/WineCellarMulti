# WineCellarMulti

New multi-user foundation for Wine Cellar.

## Goals

- real users, not global roles only
- households/workspaces with memberships
- strict data isolation by `household_id`
- backend-first architecture for multi-tenant correctness

## Stack

- Frontend: React + Vite + TypeScript
- Backend: FastAPI
- Database: PostgreSQL
- ORM/Migrations: SQLAlchemy + Alembic

## Initial scope

- email/password session foundation
- one active household per session
- CRUD for wines scoped by household
- membership roles: `owner`, `admin`, `member`, `viewer`

## Layout

- `frontend/` web app
- `backend/` API and data layer
- `shared/` shared contracts and notes
- `docs/` architecture and roadmap

## Notes

This repository is intentionally separate from the existing `WineCellar` project.

## Run Locally

Generate local secrets first. This creates the root `.env` used by Docker and `backend/.env` used by Alembic/Uvicorn:

```bash
chmod +x setup-env.sh
./setup-env.sh
```

Start Postgres:

```powershell
docker compose up -d
```

To run the full development stack with Docker:

```bash
docker compose up --build
```

This starts PostgreSQL, runs backend migrations, exposes the API on `:8000`, and exposes the frontend on `:5173`.

Run the backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
chmod +x dev.sh
./dev.sh
```

Run the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Or run backend and frontend together from the repository root:

```bash
chmod +x dev.sh
./dev.sh
```

Update backend and frontend from the repository root:

```bash
./update.sh
```

The update script pulls the latest code, installs backend dependencies, runs Alembic migrations, installs frontend dependencies, and runs the frontend build. PostgreSQL must already be running.

Start or recover the production stack after a reboot/outage:

```bash
chmod +x start.sh
./start.sh
```

First-time service installation on the Linux server:

```bash
./start.sh --install-services --build
```

Production environment values:

```env
APP_ENV=production
APP_DEBUG=false
SESSION_COOKIE_SECURE=true
CORS_ORIGINS=https://vinaris.duckdns.org,https://winecellarmulti.duckdns.org,http://localhost:5173,http://127.0.0.1:5173
```

Open `http://<server-ip>:5173`.

## Android PWA

WineCellarMulti can be installed from Android Chrome when served over HTTPS.
The frontend includes a web app manifest and service worker.

Production preview uses port `4174` to avoid conflicting with the old WineCellar app that already uses `4173`:

```bash
cd frontend
npm run build
npm run preview:pwa
```

See `docs/PWA_DEPLOYMENT.md` for the nginx configuration.

To start WineCellarMulti automatically after a server reboot, install the systemd services documented in `docs/SYSTEMD_DEPLOYMENT.md`.

## Reset Local PostgreSQL

If the local PostgreSQL password is no longer known, regenerate local secrets and recreate the development database volume:

```bash
./setup-env.sh --force
docker compose down
docker volume rm winecellarmulti_postgres-data
docker compose up -d postgres
./update.sh
```

This deletes the local development database. Do not run it if you need to preserve existing data.

## AI Features

AI generation runs only from the backend. Configure `OPENAI_API_KEY` in `backend/.env`, then restart the backend.

Optional model overrides:

```bash
OPENAI_AI_NOTES_MODEL=gpt-5.4-mini
OPENAI_DRINK_WINDOW_MODEL=gpt-5.4
OPENAI_VALUE_MODEL=gpt-5.4-mini
OPENAI_GRAPE_MODEL=gpt-5.4-nano
OPENAI_WISHLIST_MODEL=gpt-5.4
OPENAI_PAIRING_MODEL=gpt-5.4
```

Current AI actions: wine notes, drinking window, value estimate, grape composition, wishlist strategy, and food pairing.

Find the Linux machine IP with:

```bash
hostname -I
```

## Current API

- `GET /health`
- `GET /api/v1/session`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/wines`
- `POST /api/v1/wines`
- `GET /api/v1/wines/{wine_id}`
- `PATCH /api/v1/wines/{wine_id}`
- `DELETE /api/v1/wines/{wine_id}`
- `GET /api/v1/wishlist`
- `POST /api/v1/wishlist`
- `PATCH /api/v1/wishlist/{item_id}`
- `DELETE /api/v1/wishlist/{item_id}`
- `POST /api/v1/imports/legacy-json`
- `POST /api/v1/ai/wines/{wine_id}/notes`
- `POST /api/v1/ai/wines/{wine_id}/drink-window`
- `POST /api/v1/ai/wines/{wine_id}/value`
- `POST /api/v1/ai/wines/{wine_id}/grapes`
- `POST /api/v1/ai/wishlist/{item_id}/strategy`
- `POST /api/v1/ai/pairing`

The current auth flow uses email/password registration, HTTP-only session cookies, and one active household per session. Legacy JSON import is scoped to the active household and requires an owner/admin role.
