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

Start Postgres:

```powershell
docker compose up -d
```

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

Open `http://<server-ip>:5173`.

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

The current auth flow uses email/password registration, HTTP-only session cookies, and one active household per session. Passkeys and invitations come after the basic account/session model is stable.
