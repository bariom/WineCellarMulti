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

- development session foundation
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

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]
alembic upgrade head
uvicorn app.main:app --reload
```

Run the frontend in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Milestone 1 Status

- `GET /health`
- `GET /api/v1/session`
- `GET /api/v1/wines`
- `POST /api/v1/wines`
- `GET /api/v1/wines/{wine_id}`
- `PATCH /api/v1/wines/{wine_id}`
- `DELETE /api/v1/wines/{wine_id}`

Current auth is a development session seeded from `DEV_USER_EMAIL`, `DEV_USER_NAME`, and `DEV_HOUSEHOLD_NAME`. Real login and passkeys come after the tenancy boundary is stable.
