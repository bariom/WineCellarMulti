# Vinaris engineering guide

Vinaris is a multi-tenant wine-cellar application. The repository contains a
React/Vite frontend, a FastAPI backend, PostgreSQL models, and Alembic
migrations.

## Repository map

- `backend/app/api/routes/`: HTTP endpoints and request orchestration.
- `backend/app/models/`: SQLAlchemy persistence models.
- `backend/app/schemas/`: Pydantic request and response contracts.
- `backend/app/services/`: integrations and reusable domain services.
- `backend/app/prompts/`: versioned AI prompt builders.
- `backend/alembic/versions/`: append-only database migrations.
- `backend/tests/`: backend tests.
- `frontend/src/`: React application.

## Non-negotiable rules

1. Every business-data query must be scoped to the active `household_id` and
   authorization must use `CurrentContext`. Never fetch an entity by ID alone
   when it belongs to a household.
2. Do not expose provider API keys, session tokens, encrypted values, payment
   secrets, or raw AI prompts in responses or logs. Use `.env.example` for
   documented configuration and keep real `.env` files untracked.
3. Make database changes through a new Alembic migration. Do not edit an
   applied migration or rewrite production data in a route handler.
4. Preserve API schemas and frontend type contracts together. A backend
   response change normally requires a corresponding `frontend/src/types.ts`
   and UI review.
5. AI output is untrusted input: retain JSON schemas, validate parsed fields,
   and preserve source/URL verification rules before saving results.

## AI prompt library

Use `backend/app/prompts/` for new production prompt text. A prompt builder
returns `Prompt(id, version, system, user)`. The initial library covers notes,
drinking windows, market value, grapes, critic scores, and wishlist advice;
migrate remaining legacy inline prompts when their feature is changed.

- Add a named builder for every new AI feature; do not add a long inline prompt
  to an API route.
- Keep user and database data in explicit builder arguments, never in module
  constants.
- Increment `version` whenever instructions or output expectations change in a
  behaviorally meaningful way.
- Keep prompt IDs stable. They are intended for evaluation and audit
  correlation.
- Add regression tests for language, safety constraints, expected context, and
  structured-output requirements. Do not put user data, keys, or full prompts
  in logs.

## Local checks

Backend (from `backend/`, with `.venv` activated):

```bash
ruff check app
ruff format --check app
pyright app
pytest
```

Install repository hooks after installing `backend` development dependencies:

```bash
pre-commit install
```

The hooks run Ruff and Pyright on staged application Python files. Existing
migrations and test doubles are intentionally outside the initial Pyright
scope; improve them incrementally when touching those areas.

Frontend:

```bash
cd frontend
npm ci
npm run build
```

On this machine, Node and npm are available under `C:\ERI\node`; add that
directory to `PATH` for a terminal session when they are not already found.

## Change workflow

1. Read the route, schema, model, and relevant tests before changing behavior.
2. Keep changes narrow; do not mix a feature change with broad reformatting or
   migration cleanup.
3. Run the smallest relevant checks, then the full applicable suite when
   practical.
4. For AI changes, test no-result, malformed-result, and weak-evidence paths.
5. Update `README.md` or `docs/` when setup, deployment, or an externally
   visible behavior changes.
